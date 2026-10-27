import os
import cv2
import uuid
import shutil
import logging
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
from fastapi import HTTPException, UploadFile

from backend.config import settings

logger = logging.getLogger("neural_traffic.video_service")

class VideoService:
    def __init__(self):
        self.jobs_dir = Path(settings.JOBS_DIR)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def create_job(self) -> Tuple[str, Path]:
        """Creates a unique directory for a video analysis job."""
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        job_dir = self.jobs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        return job_id, job_dir

    async def save_uploaded_video(self, file: UploadFile, job_dir: Path) -> Path:
        """Validates and saves the incoming uploaded video."""
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in settings.ALLOWED_VIDEO_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported format '{suffix}'. Allowed: {', '.join(settings.ALLOWED_VIDEO_EXTENSIONS)}"
            )

        target_path = job_dir / f"input{suffix}"
        size = 0
        max_bytes = settings.MAX_VIDEO_SIZE_MB * 1024 * 1024

        with open(target_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    target_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"Video exceeds maximum allowed size of {settings.MAX_VIDEO_SIZE_MB}MB."
                    )
                buffer.write(chunk)

        if size == 0:
            target_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Uploaded video file is empty.")

        return target_path

    def inspect_video(self, video_path: Path) -> Dict[str, Any]:
        """Opens video with OpenCV and extracts fundamental metadata."""
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open video stream. Codec unsupported or file corrupt.")

        try:
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = float(cap.get(cv2.CAP_PROP_FPS))
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            if fps <= 0 or not (1 <= fps <= 240):
                fps = 30.0
            if total_frames <= 0:
                total_frames = 1

            duration_sec = total_frames / fps

            return {
                "width": width,
                "height": height,
                "fps": fps,
                "total_frames": total_frames,
                "duration_seconds": round(duration_sec, 2)
            }
        finally:
            cap.release()

    def get_video_writer(
        self,
        output_path: Path,
        width: int,
        height: int,
        fps: float
    ) -> cv2.VideoWriter:
        """Initializes VideoWriter with compatible mp4v codec."""
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
        if not writer.isOpened():
            # Fallback codec
            fourcc_fallback = cv2.VideoWriter_fourcc(*"avc1")
            writer = cv2.VideoWriter(str(output_path), fourcc_fallback, fps, (width, height))
        return writer

    def annotate_frame(
        self,
        frame: Any,
        detections: list,
        line_y: int,
        veh_count: int,
        ped_count: int,
        avg_speed: float,
        fps: float
    ) -> Any:
        """Renders bounding boxes, tracking IDs, speeds, and HUD telemetry on frame."""
        h, w, _ = frame.shape
        out = frame.copy()

        # Draw counting line (Electric Red with subtle glow)
        cv2.line(out, (0, line_y), (w, line_y), (60, 60, 240), 3)
        cv2.putText(
            out,
            "COUNTING LINE",
            (20, line_y - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (60, 60, 240),
            2,
            cv2.LINE_AA
        )

        # Color mapping (BGR)
        palette = {
            "car": (246, 130, 59),       # Blue
            "bike": (212, 182, 6),       # Cyan
            "person": (129, 185, 16),    # Emerald
            "truck": (246, 92, 139)      # Violet
        }

        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            tid = det["track_id"]
            cname = det["class_name"]
            speed = det.get("speed_kmh", 0.0)
            color = palette.get(cname.lower(), (200, 200, 200))

            # Bounding box
            cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)

            # Center point
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2
            cv2.circle(out, (cx, cy), 4, color, -1)

            # Label badge
            speed_text = f" | {speed:.1f} km/h" if speed > 0 else ""
            label = f"{cname} #{tid}{speed_text}"
            
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.rectangle(out, (x1, max(0, y1 - th - 8)), (x1 + tw + 8, y1), color, -1)
            cv2.putText(
                out,
                label,
                (x1 + 4, max(th + 2, y1 - 4)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (255, 255, 255),
                1,
                cv2.LINE_AA
            )

        # Overlay Top HUD Bar
        hud_bg = out.copy()
        cv2.rectangle(hud_bg, (0, 0), (w, 48), (11, 17, 32), -1)
        cv2.addWeighted(hud_bg, 0.75, out, 0.25, 0, out)

        hud_text = f"VEHICLES: {veh_count}  |  PEDESTRIANS: {ped_count}  |  AVG SPEED: {avg_speed:.1f} km/h  |  YOLOv8 ByteTrack"
        cv2.putText(out, hud_text, (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 230, 255), 2, cv2.LINE_AA)

        return out

    def transcode_to_h264(self, video_path: Path) -> bool:
        """Transcodes video file to web-standard H.264 (libx264, yuv420p) for HTML5 browser compatibility."""
        if not video_path.exists() or video_path.stat().st_size == 0:
            return False
        try:
            import subprocess
            import imageio_ffmpeg
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            temp_path = video_path.with_name(f"{video_path.stem}_web{video_path.suffix}")
            cmd = [
                ffmpeg_exe, "-y",
                "-i", str(video_path),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-preset", "fast",
                "-crf", "23",
                str(temp_path)
            ]
            res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if res.returncode == 0 and temp_path.exists() and temp_path.stat().st_size > 0:
                temp_path.replace(video_path)
                logger.info(f"Successfully converted {video_path.name} to H.264 MP4")
                return True
        except Exception as e:
            logger.warning(f"H264 transcoding skipped or failed: {e}")
        return False

    def get_job_video_path(self, job_id: str) -> Optional[Path]:
        """Returns the annotated video file path if it exists."""
        job_dir = self.jobs_dir / job_id
        if not job_dir.exists():
            return None
        annotated = job_dir / "annotated.mp4"
        if annotated.exists() and annotated.stat().st_size > 0:
            return annotated
        input_vid = job_dir / "input.mp4"
        if input_vid.exists():
            return input_vid
        return None

video_service = VideoService()

