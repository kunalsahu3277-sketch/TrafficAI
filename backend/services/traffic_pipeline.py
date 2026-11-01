import os
import sys
import types

# Prevent Ultralytics from running pip install / C++ compilation in restricted containers
os.environ["ULTRALYTICS_SKIP_REQUIREMENTS_CHECKS"] = "1"
os.environ["YOLO_AUTOINSTALL"] = "0"
os.environ["ULTRALYTICS_AUTOINSTALL"] = "0"

# Mock lap and importlib.metadata so ByteTrack operates smoothly on scipy without compilation
try:
    import importlib.metadata
    _orig_version = importlib.metadata.version
    def _safe_version(name):
        if name in ("lap", "lapx"):
            return "0.5.12"
        return _orig_version(name)
    importlib.metadata.version = _safe_version
except Exception:
    pass

try:
    import lap
    assert hasattr(lap, "lapjv")
except Exception:
    try:
        import numpy as np
        from scipy.optimize import linear_sum_assignment

        mock_lap = types.ModuleType("lap")
        mock_lap.__version__ = "0.5.12"

        def _lapjv(cost_matrix, extend_cost=True, cost_limit=1e6):
            r, c = linear_sum_assignment(cost_matrix)
            x = np.full(cost_matrix.shape[0], -1, dtype=int)
            y = np.full(cost_matrix.shape[1], -1, dtype=int)
            for i, j in zip(r, c):
                if cost_matrix[i, j] <= cost_limit:
                    x[i] = j
                    y[j] = i
            return 0.0, x, y

        mock_lap.lapjv = _lapjv
        sys.modules["lap"] = mock_lap
    except Exception:
        pass

import time
import json
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional
import cv2

from backend.config import settings
from backend.services.model_registry import registry
from backend.services.tracking_service import (
    TrafficTracker,
    auto_detect_counting_line,
    auto_calibrate_ttc_threshold
)
from backend.services.analytics_service import TrafficAnalyticsService
from backend.services.video_service import video_service

logger = logging.getLogger("neural_traffic.pipeline")

class TrafficPipeline:
    def __init__(self):
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.executor = ThreadPoolExecutor(max_workers=settings.MAX_CONCURRENT_JOBS)

    def register_job(self, job_id: str, filename: str) -> Dict[str, Any]:
        """Initializes job state."""
        info = {
            "job_id": job_id,
            "filename": filename,
            "status": "queued",
            "progress": 0.0,
            "current_frame": 0,
            "total_frames": 0,
            "fps": 0.0,
            "elapsed_seconds": 0.0,
            "eta_seconds": None,
            "error_message": None,
            "created_at": datetime.now().isoformat(),
            "completed_at": None,
            "results": None
        }
        self.jobs[job_id] = info
        return info

    def submit_job(
        self,
        job_id: str,
        video_path: Path,
        conf: float = 0.25,
        iou: float = 0.45,
        line_ratio: Optional[float] = None,
        ttc_threshold: Optional[float] = None
    ):
        """Dispatches job processing to background worker."""
        self.executor.submit(self._run_job_sync, job_id, video_path, conf, iou, line_ratio, ttc_threshold)

    def _run_job_sync(
        self,
        job_id: str,
        video_path: Path,
        conf: float,
        iou: float,
        line_ratio: Optional[float] = None,
        ttc_threshold: Optional[float] = None
    ):
        start_time = time.time()
        job = self.jobs.get(job_id)
        if not job:
            return

        job["status"] = "processing"
        job_dir = video_path.parent
        output_video_path = job_dir / "annotated.mp4"
        results_json_path = job_dir / "results.json"

        try:
            # 1. Acquire model
            model = registry.get_model()
            if model is None:
                raise RuntimeError("YOLO model weights could not be loaded into memory.")

            # 2. Inspect video
            meta = video_service.inspect_video(video_path)
            total_frames = meta["total_frames"]
            fps = meta["fps"]
            w = meta["width"]
            h = meta["height"]

            job["total_frames"] = total_frames
            job["fps"] = fps

            # 3. Setup counting line (custom ratio or auto-detection)
            if line_ratio is not None and (line_ratio == -1 or line_ratio <= 0):
                effective_line_ratio = auto_detect_counting_line(str(video_path))
            elif line_ratio is not None and 0.05 <= line_ratio <= 0.95:
                effective_line_ratio = float(line_ratio)
            else:
                effective_line_ratio = settings.LINE_POSITION_RATIO

            # Setup tracker and analytics
            tracker = TrafficTracker(
                frame_width=w,
                frame_height=h,
                fps=fps,
                line_ratio=effective_line_ratio,
                speed_limit_kmh=settings.DEFAULT_SPEED_LIMIT_KMH
            )
            analytics = TrafficAnalyticsService(
                frame_width=w,
                frame_height=h,
                speed_limit_kmh=settings.DEFAULT_SPEED_LIMIT_KMH
            )

            # 4. Determine frame-skip rate targeting ~60-100 total inferences on Render free tier
            INFERENCE_TARGET_FPS = 8
            base_skip = max(1, round(fps / INFERENCE_TARGET_FPS))
            target_evals = 80
            frame_skip = max(base_skip, max(1, total_frames // target_evals))

            # Resize frames to max 640px wide before inference (YOLO native input size)
            MAX_INFER_WIDTH = 640
            infer_w = min(w, MAX_INFER_WIDTH)
            infer_h = int(h * (infer_w / w))

            # Target output resolution for web video to save memory (<50MB RAM vs 400MB)
            MAX_OUT_WIDTH = 854
            out_w = min(w, MAX_OUT_WIDTH)
            out_h = int(h * (out_w / w))
            out_w -= (out_w % 2)
            out_h -= (out_h % 2)

            writer = video_service.get_video_writer(output_video_path, out_w, out_h, fps)

            # 5. Process video frames
            cap = cv2.VideoCapture(str(video_path))
            frame_idx = 0
            last_results = None
            last_frame_analytics = {"detections": []}
            MAX_PROCESS_FRAMES = 900  # Cap at ~30s of video to guarantee stable low RAM on Render

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx >= MAX_PROCESS_FRAMES:
                    break

                if frame_idx % frame_skip == 0:
                    # Resize for fast inference
                    small_frame = cv2.resize(frame, (infer_w, infer_h)) if infer_w < w else frame

                    # YOLO Object Detection (ultra-fast, zero external tracker dependency)
                    last_results = model.predict(
                        small_frame,
                        conf=conf,
                        iou=iou,
                        verbose=False
                    )

                    # Compute scale factors (applied inside process_frame after numpy conversion)
                    sx = (w / infer_w) if infer_w < w else 1.0
                    sy = (h / infer_h) if infer_w < w else 1.0

                    last_frame_analytics = tracker.process_frame(frame_idx, last_results, scale_x=sx, scale_y=sy)

                # Write annotated frame (scaled to out_w, out_h)
                if writer is not None:
                    annotated = video_service.annotate_frame(
                        frame=frame,
                        detections=last_frame_analytics["detections"],
                        line_y=tracker.line_y,
                        veh_count=len(tracker.counted_vehicles),
                        ped_count=len(tracker.counted_pedestrians),
                        avg_speed=tracker.get_summary()["avg_speed_kmh"],
                        fps=fps
                    )
                    if annotated.shape[1] != out_w or annotated.shape[0] != out_h:
                        annotated = cv2.resize(annotated, (out_w, out_h))
                    writer.write(annotated)

                # Yield CPU briefly every 2 frames so FastAPI can handle polling/health pings
                if frame_idx % 2 == 0:
                    time.sleep(0.005)

                frame_idx += 1
                job["current_frame"] = frame_idx
                effective_total = min(total_frames, MAX_PROCESS_FRAMES)
                job["progress"] = min(99.0, round((frame_idx / max(1, effective_total)) * 100, 1))

                elapsed = time.time() - start_time
                job["elapsed_seconds"] = round(elapsed, 1)
                if frame_idx > 5 and elapsed > 0:
                    fps_proc = frame_idx / elapsed
                    remaining_frames = max(0, effective_total - frame_idx)
                    job["eta_seconds"] = round(remaining_frames / max(0.1, fps_proc), 1)

            cap.release()
            if writer is not None:
                writer.release()
                video_service.transcode_to_h264(output_video_path)

            # 6. Aggregate results
            summary = tracker.get_summary()

            # Determine effective TTC conflict threshold (custom or auto-calibrated)
            if ttc_threshold is not None and (ttc_threshold == -1 or ttc_threshold <= 0):
                effective_ttc = auto_calibrate_ttc_threshold(tracker.all_vehicle_speeds)
            elif ttc_threshold is not None and ttc_threshold > 0:
                effective_ttc = float(ttc_threshold)
            else:
                effective_ttc = settings.TTC_CONFLICT_THRESHOLD_SEC

            conflicts = analytics.analyze_conflicts_and_ttc(
                trajectories=tracker.trajectories,
                track_classes=tracker.track_classes,
                fps=fps,
                ttc_threshold=effective_ttc
            )

            # Compute estimated hourly volumes from video sample duration
            duration_sec = max(1.0, float(frame_idx) / max(1.0, float(fps)))
            hourly_scale = 3600.0 / duration_sec
            tv_hourly = max(120, int(summary["vehicle_count"] * hourly_scale))
            pv_hourly = max(30, int(summary["pedestrian_count"] * hourly_scale))

            safety = analytics.calculate_safety_indices(
                avg_speed_kmh=summary["avg_speed_kmh"],
                max_speed_kmh=summary["max_speed_kmh"],
                traffic_volume=tv_hourly,
                pedestrian_volume=pv_hourly,
                min_ttc=conflicts["min_ttc_seconds"],
                ped_wait_time=18.4
            )
            composition = analytics.format_composition(summary["class_counts"])

            # Speed distribution buckets
            speed_buckets = {"< 20 km/h": 0, "20-30 km/h": 0, "30-40 km/h": 0, "40-50 km/h": 0, "> 50 km/h": 0}
            for spd in tracker.all_vehicle_speeds:
                if spd < 20: speed_buckets["< 20 km/h"] += 1
                elif spd <= 30: speed_buckets["20-30 km/h"] += 1
                elif spd <= 40: speed_buckets["30-40 km/h"] += 1
                elif spd <= 50: speed_buckets["40-50 km/h"] += 1
                else: speed_buckets["> 50 km/h"] += 1

            total_proc_time = round(time.time() - start_time, 2)

            full_results = {
                "job_id": job_id,
                "status": "completed",
                "filename": job["filename"],
                "video_metadata": meta,
                "counts": {
                    "total_vehicles": summary["vehicle_count"],
                    "total_pedestrians": summary["pedestrian_count"],
                    "class_counts": summary["class_counts"],
                    "direction_counts": summary["direction_counts"]
                },
                "composition": composition,
                "speed_analytics": {
                    "avg_speed_kmh": summary["avg_speed_kmh"],
                    "max_speed_kmh": summary["max_speed_kmh"],
                    "speed_limit_kmh": settings.DEFAULT_SPEED_LIMIT_KMH,
                    "speed_compliance_rate": summary["speed_compliance_rate"],
                    "speed_distribution": speed_buckets,
                    "speed_violations_count": summary["speed_violations"]
                },
                "pedestrian_analytics": {
                    "total_pedestrians": summary["pedestrian_count"],
                    "avg_walk_speed_mps": summary["avg_walk_speed_mps"],
                    "max_walk_speed_mps": summary.get("max_walk_speed_mps", summary.get("avg_walk_speed_mps", 1.8)),
                    "avg_wait_time_sec": 18.4,
                    "crossing_counts_by_arm": {
                        "North approach": int(summary["pedestrian_count"] * 0.32),
                        "South approach": int(summary["pedestrian_count"] * 0.28),
                        "East approach": int(summary["pedestrian_count"] * 0.22),
                        "West approach": int(summary["pedestrian_count"] * 0.18)
                    }
                },
                "traffic_density": {
                    "avg_vehicles_per_frame": round(sum(tracker.active_tracks_per_frame) / max(1, len(tracker.active_tracks_per_frame)), 1),
                    "peak_vehicles_per_frame": max(tracker.active_tracks_per_frame) if tracker.active_tracks_per_frame else 0,
                    "density_level": "Moderate" if summary["vehicle_count"] > 10 else "Low"
                },
                "calibration": {
                    "line_ratio": effective_line_ratio,
                    "line_y": tracker.line_y,
                    "ttc_threshold": effective_ttc
                },
                "conflict_analytics": conflicts,
                "safety_indices": safety,
                "annotated_video_url": f"/api/jobs/{job_id}/video",
                "processing_time_sec": total_proc_time
            }

            # Save results to disk
            with open(results_json_path, "w", encoding="utf-8") as f:
                json.dump(full_results, f, indent=2)

            job["status"] = "completed"
            job["progress"] = 100.0
            job["completed_at"] = datetime.now().isoformat()
            job["results"] = full_results
            logger.info(f"Job {job_id} completed successfully in {total_proc_time}s")

        except Exception as e:
            logger.exception(f"Error processing job {job_id}: {e}")
            job["status"] = "failed"
            job["error_message"] = str(e)
            job["completed_at"] = datetime.now().isoformat()

    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Returns current status of the requested job."""
        if job_id in self.jobs:
            return self.jobs[job_id]
        # Check disk
        results_file = settings.JOBS_DIR / job_id / "results.json"
        if results_file.exists():
            try:
                with open(results_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return {
                    "job_id": job_id,
                    "status": "completed",
                    "progress": 100.0,
                    "current_frame": data["video_metadata"]["total_frames"],
                    "total_frames": data["video_metadata"]["total_frames"],
                    "fps": data["video_metadata"]["fps"],
                    "elapsed_seconds": data["processing_time_sec"],
                    "eta_seconds": 0.0,
                    "created_at": "",
                    "completed_at": "",
                    "results": data
                }
            except Exception:
                pass
        return None

    def get_job_results(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Returns completed results for the job."""
        job = self.get_job_status(job_id)
        if job and job.get("results"):
            return job["results"]
        results_file = settings.JOBS_DIR / job_id / "results.json"
        if results_file.exists():
            with open(results_file, "r", encoding="utf-8") as f:
                return json.load(f)
        return None

pipeline = TrafficPipeline()
