import math
import logging
from collections import defaultdict, deque
from typing import Dict, List, Set, Tuple, Any, Optional

from backend.config import settings

logger = logging.getLogger("neural_traffic.tracking_service")

class TrafficTracker:
    """
    Integrates ByteTrack object tracking, directional line crossing,
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
        ratio = line_ratio or settings.LINE_POSITION_RATIO
        self.line_y = int(self.h * ratio)
        self.line_start = (0, self.line_y)
        self.line_end = (self.w, self.line_y)
        
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
        Process YOLO track results for a single frame.
        scale_x / scale_y: multiply bbox coords back to original resolution
        when inference was run on a downscaled frame.
        """
        current_time_sec = frame_idx / self.fps
        active_ids_in_frame = 0
        detections_out = []

        if results and results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy().copy()  # writable copy
            track_ids = results[0].boxes.id.cpu().numpy()
            classes = results[0].boxes.cls.cpu().numpy()
            confidences = results[0].boxes.conf.cpu().numpy()
            model_names = results[0].names

            # Scale bboxes back to original frame resolution (safe on numpy arrays)
            if scale_x != 1.0 or scale_y != 1.0:
                boxes[:, [0, 2]] *= scale_x
                boxes[:, [1, 3]] *= scale_y

            for box, tid_float, cls_float, conf_float in zip(boxes, track_ids, classes, confidences):
                x1, y1, x2, y2 = map(int, box)
                tid = int(tid_float)
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

                    # Line Crossing Logic (True edge-crossing test)
                    prev_y = prev_cy
                    curr_y = cy

                    # Direction 1: Downward (Inbound)
                    if prev_y < self.line_y and curr_y >= self.line_y:
                        self._register_crossing(tid, class_name, is_ped, "inbound", speed_kmh, speed_mps, current_time_sec)
                    # Direction 2: Upward (Outbound)
                    elif prev_y > self.line_y and curr_y <= self.line_y:
                        self._register_crossing(tid, class_name, is_ped, "outbound", speed_kmh, speed_mps, current_time_sec)

                # Record history
                self.track_history[tid].append((cx, cy, frame_idx))
                self.trajectories[tid].append((cx, cy))

                detections_out.append({
                    "bbox": [x1, y1, x2, y2],
                    "track_id": tid,
                    "class_name": class_name,
                    "confidence": round(conf, 3),
                    "speed_kmh": round(speed_kmh, 1),
                    "is_pedestrian": is_ped
                })

        self.active_tracks_per_frame.append(active_ids_in_frame)

        return {
            "frame_idx": frame_idx,
            "timestamp_sec": current_time_sec,
            "active_tracks": active_ids_in_frame,
            "detections": detections_out,
            "total_vehicles_counted": len(self.counted_vehicles),
            "total_pedestrians_counted": len(self.counted_pedestrians),
            "line_y": self.line_y
        }

    def _register_crossing(
        self,
        tid: int,
        class_name: str,
        is_ped: bool,
        direction: str,
        speed_kmh: float,
        speed_mps: float,
        timestamp_sec: float
    ):
        if is_ped:
            if tid not in self.counted_pedestrians:
                self.counted_pedestrians.add(tid)
                self.class_counts[class_name] += 1
                self.direction_counts[direction] += 1
                if speed_mps > 0:
                    self.all_pedestrian_speeds.append(speed_mps)
        else:
            if tid not in self.counted_vehicles:
                self.counted_vehicles.add(tid)
                self.class_counts[class_name] += 1
                self.direction_counts[direction] += 1
                if speed_kmh > 0:
                    self.all_vehicle_speeds.append(speed_kmh)

                # Time headway
                if self.last_cross_time is not None:
                    headway = timestamp_sec - self.last_cross_time
                    if 0.2 <= headway <= 60.0:
                        self.time_headways.append(headway)
                self.last_cross_time = timestamp_sec

    def get_summary(self) -> Dict[str, Any]:
        """
        Produce a comprehensive analytics dictionary for the video session.
        """
        total_veh = len(self.counted_vehicles)
        total_ped = len(self.counted_pedestrians)

        avg_spd = sum(self.all_vehicle_speeds) / len(self.all_vehicle_speeds) if self.all_vehicle_speeds else 0.0
        max_spd = max(self.all_vehicle_speeds) if self.all_vehicle_speeds else 0.0
        violations = sum(1 for s in self.all_vehicle_speeds if s > self.speed_limit)
        compliance = round((1.0 - (violations / max(1, len(self.all_vehicle_speeds)))) * 100, 1)

        avg_walk = sum(self.all_pedestrian_speeds) / len(self.all_pedestrian_speeds) if self.all_pedestrian_speeds else 0.0
        max_walk = max(self.all_pedestrian_speeds) if self.all_pedestrian_speeds else 0.0

        return {
            "vehicle_count": total_veh,
            "pedestrian_count": total_ped,
            "class_counts": dict(self.class_counts),
            "direction_counts": self.direction_counts,
            "avg_speed_kmh": round(avg_spd, 1),
            "max_speed_kmh": round(max_spd, 1),
            "speed_violations": violations,
            "speed_compliance_rate": compliance,
            "avg_walk_speed_mps": round(avg_walk, 2),
            "max_walk_speed_mps": round(max_walk, 2),
            "avg_time_headway_sec": round(sum(self.time_headways) / len(self.time_headways), 2) if self.time_headways else 2.5,
            "active_tracks_history": self.active_tracks_per_frame
        }
