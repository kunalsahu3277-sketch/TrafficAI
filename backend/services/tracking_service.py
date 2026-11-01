import math
import logging
from collections import defaultdict, deque
from typing import Dict, List, Set, Tuple, Any, Optional
import numpy as np
import cv2

from backend.config import settings

logger = logging.getLogger("neural_traffic.tracking_service")


def auto_detect_counting_line(video_path: str, sample_frames: int = 40) -> float:
    """
    Auto-detect the best counting line Y-position by analysing motion density
    across sampled frames.

    Strategy:
      1. Read ~sample_frames evenly spaced frames.
      2. Compute frame-difference (motion) image and accumulate a per-row sum.
      3. Restrict search to the central 30-70% of frame height (avoids sky/ground edges).
      4. Pick the row with peak accumulated motion → that is where vehicles are most active.
      5. Return as a ratio 0-1 (line_y / frame_height).

    Falls back to settings.LINE_POSITION_RATIO if anything goes wrong.
    """
    try:
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return settings.LINE_POSITION_RATIO

        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1
        step = max(1, total // sample_frames)

        row_motion = np.zeros(h, dtype=np.float64)
        prev_gray = None

        for fi in range(0, min(total - 1, sample_frames * step), step):
            cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
            ret, frame = cap.read()
            if not ret:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            if prev_gray is not None and prev_gray.shape == gray.shape:
                diff = cv2.absdiff(gray, prev_gray)
                # Per-row sum of motion
                row_motion += diff.sum(axis=1).astype(np.float64)
            prev_gray = gray

        cap.release()

        if row_motion.max() == 0:
            return settings.LINE_POSITION_RATIO

        # Restrict to central 30-70% band
        lo = int(h * 0.30)
        hi = int(h * 0.70)
        search = row_motion[lo:hi]
        best_local = int(np.argmax(search))
        best_row = lo + best_local

        ratio = round(best_row / h, 3)
        logger.info(f"[AutoLine] Detected counting line at row {best_row}/{h} → ratio {ratio}")
        return ratio

    except Exception as exc:
        logger.warning(f"[AutoLine] Failed ({exc}); using default {settings.LINE_POSITION_RATIO}")
        return settings.LINE_POSITION_RATIO


def auto_calibrate_ttc_threshold(speed_samples: List[float]) -> float:
    """
    Auto-calibrate TTC conflict threshold based on observed vehicle speeds.

    Logic (IRC / HCM-aligned):
      - Slow traffic  (avg < 20 km/h)  → 3.5 s  (more time needed to react in dense urban)
      - Normal traffic (20-40 km/h)    → 2.5 s  (default)
      - Fast traffic  (> 40 km/h)      → 1.8 s  (higher speed → shorter reaction window)
      - Very fast     (> 60 km/h)      → 1.2 s

    Falls back to settings.TTC_CONFLICT_THRESHOLD_SEC if no speed data.
    """
    if not speed_samples:
        return settings.TTC_CONFLICT_THRESHOLD_SEC

    avg_speed = float(np.mean(speed_samples))

    if avg_speed > 60:
        threshold = 1.2
    elif avg_speed > 40:
        threshold = 1.8
    elif avg_speed >= 20:
        threshold = 2.5
    else:
        threshold = 3.5

    logger.info(f"[AutoTTC] avg_speed={avg_speed:.1f} km/h → TTC threshold={threshold}s")
    return threshold


class CentroidTracker:
    """
    High-performance, pure-Python Euclidean centroid tracker.
    Provides persistent track IDs across frames without requiring external C++
    libraries (such as lap / lapjv) that exceed memory limits in constrained cloud runtimes.
    """
    def __init__(self, max_dist: float = 140.0, max_lost: int = 20):
        self.next_id = 1
        self.tracks: Dict[int, Dict[str, Any]] = {}
        self.max_dist = max_dist
        self.max_lost = max_lost

    def update(self, boxes: np.ndarray) -> List[int]:
        if len(boxes) == 0:
            for tid in list(self.tracks.keys()):
                self.tracks[tid]["lost"] += 1
                if self.tracks[tid]["lost"] > self.max_lost:
                    del self.tracks[tid]
            return []

        centroids = [((b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0) for b in boxes]
        assigned_ids = []

        if len(self.tracks) == 0:
            for c in centroids:
                tid = self.next_id
                self.next_id += 1
                self.tracks[tid] = {"cx": c[0], "cy": c[1], "lost": 0}
                assigned_ids.append(tid)
            return assigned_ids

        track_ids = list(self.tracks.keys())
        track_cents = [(self.tracks[t]["cx"], self.tracks[t]["cy"]) for t in track_ids]

        matched_tracks = set()
        for c in centroids:
            best_dist = float("inf")
            best_tid = None
            for tid, tc in zip(track_ids, track_cents):
                if tid in matched_tracks:
                    continue
                d = math.hypot(c[0] - tc[0], c[1] - tc[1])
                if d < best_dist and d <= self.max_dist:
                    best_dist = d
                    best_tid = tid

            if best_tid is not None:
                self.tracks[best_tid]["cx"] = c[0]
                self.tracks[best_tid]["cy"] = c[1]
                self.tracks[best_tid]["lost"] = 0
                matched_tracks.add(best_tid)
                assigned_ids.append(best_tid)
            else:
                new_id = self.next_id
                self.next_id += 1
                self.tracks[new_id] = {"cx": c[0], "cy": c[1], "lost": 0}
                assigned_ids.append(new_id)

        for tid in track_ids:
            if tid not in matched_tracks:
                self.tracks[tid]["lost"] += 1
                if self.tracks[tid]["lost"] > self.max_lost:
                    del self.tracks[tid]

        return assigned_ids


class TrafficTracker:
    """
    Integrates object tracking, directional line crossing,
    and calibrated speed/velocity estimation based on COUNTDETECTSINGLE27.PY and speed.py.
    """
    def __init__(
        self,
        frame_width: int,
        frame_height: int,
        fps: float = 30.0,
        pixel_to_meter: float = None,
        ped_pixel_to_meter: float = None,
        line_ratio: float = None,
        speed_limit_kmh: float = None
    ):
        self.w = frame_width
        self.h = frame_height
        self.fps = max(1.0, float(fps))
        self.pixel_to_meter = pixel_to_meter or settings.PIXEL_TO_METER
        self.ped_pixel_to_meter = ped_pixel_to_meter or settings.PED_PIXEL_TO_METER
        self.speed_limit = speed_limit_kmh or settings.DEFAULT_SPEED_LIMIT_KMH
        
        # Counting line coordinates (default: 58% down the frame)
        ratio = float(line_ratio) if line_ratio is not None and 0.05 <= line_ratio <= 0.95 else settings.LINE_POSITION_RATIO
        self.line_ratio = round(ratio, 3)
        self.line_y = int(self.h * ratio)
        self.line_start = (0, self.line_y)
        self.line_end = (self.w, self.line_y)
        
        # Internal pure-Python tracker fallback
        self.centroid_tracker = CentroidTracker()

        # State tracking
        self.track_history = defaultdict(lambda: deque(maxlen=30))
        self.track_classes = {}
        self.track_speeds = defaultdict(list)
        self.counted_ids: Set[int] = set()
        self.counted_pedestrians: Set[int] = set()
        self.counted_vehicles: Set[int] = set()
        
        # Class-specific counts
        self.class_counts: Dict[str, int] = defaultdict(int)
        self.direction_counts = {"inbound": 0, "outbound": 0}
        
        # Temporal metrics
        self.last_cross_time: Optional[float] = None
        self.time_headways: List[float] = []
        
        # Cumulative analytics
        self.all_vehicle_speeds: List[float] = []
        self.all_pedestrian_speeds: List[float] = []
        self.active_tracks_per_frame: List[int] = []
        self.trajectories: Dict[int, List[Tuple[int, int]]] = defaultdict(lambda: deque(maxlen=60))

    def process_frame(self, frame_idx: int, results: Any, scale_x: float = 1.0, scale_y: float = 1.0) -> Dict[str, Any]:
        """
        Process YOLO detection/track results for a single frame.
        scale_x / scale_y: multiply bbox coords back to original resolution
        when inference was run on a downscaled frame.
        """
        current_time_sec = frame_idx / self.fps
        active_ids_in_frame = 0
        detections_out = []

        if results and results[0].boxes is not None and len(results[0].boxes) > 0:
            boxes = results[0].boxes.xyxy.cpu().numpy().copy()  # writable copy
            classes = results[0].boxes.cls.cpu().numpy()
            confidences = results[0].boxes.conf.cpu().numpy()
            model_names = results[0].names

            # Scale bboxes back to original frame resolution (safe on numpy arrays)
            if scale_x != 1.0 or scale_y != 1.0:
                boxes[:, [0, 2]] *= scale_x
                boxes[:, [1, 3]] *= scale_y

            # Use Ultralytics tracker IDs if provided; otherwise use internal CentroidTracker
            if results[0].boxes.id is not None:
                track_ids = results[0].boxes.id.cpu().numpy()
            else:
                track_ids = self.centroid_tracker.update(boxes)

            for box, tid_val, cls_float, conf_float in zip(boxes, track_ids, classes, confidences):
                x1, y1, x2, y2 = map(int, box)
                tid = int(tid_val)
                cls_id = int(cls_float)
                conf = float(conf_float)
                class_name = model_names.get(cls_id, f"Class_{cls_id}")

                self.track_classes[tid] = class_name
                cx = (x1 + x2) // 2
                cy = (y1 + y2) // 2
                active_ids_in_frame += 1

                is_ped = class_name.lower() in ["person", "pedestrian"]
                p2m = self.ped_pixel_to_meter if is_ped else self.pixel_to_meter

                # Speed and displacement calculation
                speed_kmh = 0.0
                speed_mps = 0.0

                if tid in self.track_history and len(self.track_history[tid]) > 0:
                    prev_cx, prev_cy, prev_f = self.track_history[tid][-1]
                    dist_px = math.hypot(cx - prev_cx, cy - prev_cy)
                    dt = (frame_idx - prev_f) / self.fps

                    if dt > 0:
                        dist_m = dist_px * p2m
                        speed_mps = dist_m / dt
                        speed_kmh = speed_mps * 3.6

                        # Smooth with recent speeds
                        if speed_kmh < 180.0:  # Filter out tracking glitch spikes
                            self.track_speeds[tid].append(speed_kmh)
                            avg_smoothed = sum(self.track_speeds[tid][-5:]) / len(self.track_speeds[tid][-5:])
                            speed_kmh = avg_smoothed

                # Save current point to history
                self.track_history[tid].append((cx, cy, frame_idx))
                self.trajectories[tid].append((cx, cy))

                # Check line crossing
                if len(self.track_history[tid]) >= 2:
                    p1 = self.track_history[tid][-2]
                    p2 = self.track_history[tid][-1]

                    if tid not in self.counted_ids:
                        crossed = (p1[1] < self.line_y <= p2[1]) or (p2[1] < self.line_y <= p1[1])
                        if crossed:
                            self.counted_ids.add(tid)
                            self.class_counts[class_name] += 1

                            # Direction detection (inbound = moving downwards)
                            direction = "inbound" if p2[1] > p1[1] else "outbound"
                            self.direction_counts[direction] += 1

                            # Time headway
                            if self.last_cross_time is not None:
                                headway = current_time_sec - self.last_cross_time
                                if 0.2 < headway < 60.0:
                                    self.time_headways.append(round(headway, 2))
                            self.last_cross_time = current_time_sec

                            if is_ped:
                                self.counted_pedestrians.add(tid)
                                if speed_kmh > 0:
                                    self.all_pedestrian_speeds.append(speed_kmh)
                            else:
                                self.counted_vehicles.add(tid)
                                if speed_kmh > 0:
                                    self.all_vehicle_speeds.append(speed_kmh)

                detections_out.append({
                    "track_id": tid,
                    "bbox": [x1, y1, x2, y2],
                    "class": class_name,
                    "class_name": class_name,
                    "confidence": round(conf, 3),
                    "speed_kmh": round(speed_kmh, 1),
                    "is_pedestrian": is_ped
                })

        self.active_tracks_per_frame.append(active_ids_in_frame)
        return {
            "frame_idx": frame_idx,
            "timestamp": round(current_time_sec, 2),
            "detections": detections_out,
            "active_tracks": active_ids_in_frame
        }

    def get_summary(self) -> Dict[str, Any]:
        """Compiles finalized traffic metrics."""
        # Fallback speed extraction if line was not crossed
        if not self.all_vehicle_speeds:
            for tid, speeds in self.track_speeds.items():
                cname = self.track_classes.get(tid, "")
                if cname.lower() not in ["person", "pedestrian"]:
                    valid_spds = [s for s in speeds if 2.0 <= s <= 140.0]
                    if valid_spds:
                        self.all_vehicle_speeds.append(sum(valid_spds) / len(valid_spds))

        if not self.all_pedestrian_speeds:
            for tid, speeds in self.track_speeds.items():
                cname = self.track_classes.get(tid, "")
                if cname.lower() in ["person", "pedestrian"]:
                    valid_spds = [s for s in speeds if 0.5 <= s <= 20.0]
                    if valid_spds:
                        self.all_pedestrian_speeds.append(sum(valid_spds) / len(valid_spds))

        # Fallback counts if line crossing was missed
        veh_count = len(self.counted_vehicles)
        ped_count = len(self.counted_pedestrians)
        if veh_count == 0:
            veh_count = sum(1 for tid, cname in self.track_classes.items() if cname.lower() not in ["person", "pedestrian"])
        if ped_count == 0:
            ped_count = sum(1 for tid, cname in self.track_classes.items() if cname.lower() in ["person", "pedestrian"])

        avg_speed = round(float(np.mean(self.all_vehicle_speeds)), 1) if self.all_vehicle_speeds else 0.0
        max_speed = round(float(np.max(self.all_vehicle_speeds)), 1) if self.all_vehicle_speeds else 0.0
        violations = sum(1 for s in self.all_vehicle_speeds if s > self.speed_limit)
        compliance = round(((len(self.all_vehicle_speeds) - violations) / max(1, len(self.all_vehicle_speeds))) * 100, 1)

        avg_walk_speed = round(float(np.mean(self.all_pedestrian_speeds)) / 3.6, 2) if self.all_pedestrian_speeds else 1.2
        max_walk_speed = round(float(np.max(self.all_pedestrian_speeds)) / 3.6, 2) if self.all_pedestrian_speeds else 1.8
        avg_headway = round(float(np.mean(self.time_headways)), 2) if self.time_headways else 0.0

        return {
            "total_counted": veh_count + ped_count,
            "vehicle_count": veh_count,
            "pedestrian_count": ped_count,
            "class_counts": dict(self.class_counts) or {c: sum(1 for x in self.track_classes.values() if x == c) for c in set(self.track_classes.values())},
            "direction_counts": self.direction_counts,
            "avg_speed_kmh": avg_speed,
            "max_speed_kmh": max_speed,
            "speed_violations": violations,
            "speed_compliance_rate": compliance,
            "avg_walk_speed_mps": avg_walk_speed,
            "max_walk_speed_mps": max_walk_speed,
            "avg_time_headway_sec": avg_headway,
            "line_ratio_used": self.line_ratio
        }
