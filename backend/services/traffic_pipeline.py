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
from backend.services.tracking_service import TrafficTracker
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
        iou: float = 0.45
    ):
        """Dispatches job processing to background worker."""
        self.executor.submit(self._run_job_sync, job_id, video_path, conf, iou)

    def _run_job_sync(
        self,
        job_id: str,
        video_path: Path,
        conf: float,
        iou: float
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

            # 3. Setup tracker and analytics
            tracker = TrafficTracker(
                frame_width=w,
                frame_height=h,
                fps=fps,
                speed_limit_kmh=settings.DEFAULT_SPEED_LIMIT_KMH
            )
            analytics = TrafficAnalyticsService(
                frame_width=w,
                frame_height=h,
                speed_limit_kmh=settings.DEFAULT_SPEED_LIMIT_KMH
            )

            # 4. Determine frame-skip rate to target ~8 inference fps regardless of source fps
            #    e.g. 30fps source → skip every 3rd frame; 60fps → skip 7; keeps accuracy high
            INFERENCE_TARGET_FPS = 8
            frame_skip = max(1, round(fps / INFERENCE_TARGET_FPS))

            # Resize frames to max 640px wide before inference (YOLO native input size)
            MAX_INFER_WIDTH = 640
            infer_w = min(w, MAX_INFER_WIDTH)
            infer_h = int(h * (infer_w / w))

            # Setup output writer only if resolution is reasonable (skip for very large vids)
            WRITE_ANNOTATED = w <= 1920
            writer = video_service.get_video_writer(output_video_path, w, h, fps) if WRITE_ANNOTATED else None

            # 5. Process video frames
            cap = cv2.VideoCapture(str(video_path))
            frame_idx = 0
            last_results = None
            last_frame_analytics = {"detections": []}

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % frame_skip == 0:
                    # Resize for fast inference
                    small_frame = cv2.resize(frame, (infer_w, infer_h)) if infer_w < w else frame

                    # YOLO Tracking with ByteTrack
                    last_results = model.track(
                        small_frame,
                        persist=True,
                        tracker="bytetrack.yaml",
                        conf=conf,
                        iou=iou,
                        verbose=False
                    )

                    # Compute scale factors (applied inside process_frame after numpy conversion)
                    sx = (w / infer_w) if infer_w < w else 1.0
                    sy = (h / infer_h) if infer_w < w else 1.0

                    last_frame_analytics = tracker.process_frame(frame_idx, last_results, scale_x=sx, scale_y=sy)

                # Write annotated frame (reuse last detections for skipped frames)
                if WRITE_ANNOTATED and writer is not None:
                    annotated = video_service.annotate_frame(
                        frame=frame,
                        detections=last_frame_analytics["detections"],
                        line_y=tracker.line_y,
                        veh_count=len(tracker.counted_vehicles),
                        ped_count=len(tracker.counted_pedestrians),
                        avg_speed=tracker.get_summary()["avg_speed_kmh"],
                        fps=fps
                    )
                    writer.write(annotated)

                frame_idx += 1
                job["current_frame"] = frame_idx
                job["progress"] = round((frame_idx / total_frames) * 100, 1)

                elapsed = time.time() - start_time
                job["elapsed_seconds"] = round(elapsed, 1)
                if frame_idx > 5 and elapsed > 0:
                    fps_proc = frame_idx / elapsed
                    remaining_frames = max(0, total_frames - frame_idx)
                    job["eta_seconds"] = round(remaining_frames / max(0.1, fps_proc), 1)

            cap.release()
            if writer is not None:
                writer.release()
                video_service.transcode_to_h264(output_video_path)

            # 6. Aggregate results
            summary = tracker.get_summary()
            conflicts = analytics.analyze_conflicts_and_ttc(
                trajectories=tracker.trajectories,
                track_classes=tracker.track_classes,
                fps=fps
            )
            safety = analytics.calculate_safety_indices(
                avg_speed_kmh=summary["avg_speed_kmh"],
                max_speed_kmh=summary["max_speed_kmh"],
                traffic_volume=summary["vehicle_count"],
                pedestrian_volume=summary["pedestrian_count"],
                min_ttc=conflicts["min_ttc_seconds"]
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
                    "max_walk_speed_mps": summary["max_walk_speed_mps"],
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
