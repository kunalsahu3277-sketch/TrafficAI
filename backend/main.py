import os
import io
import time
from datetime import datetime
from pathlib import Path
from PIL import Image
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.config import settings
from backend.schemas import (
    HealthResponse,
    ModelInfo,
    ImagePredictResponse,
    JobStatusResponse,
    JobResultResponse,
    DetectionItem
)
from backend.services.model_registry import registry
from backend.services.video_service import video_service
from backend.services.traffic_pipeline import pipeline

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Real-time intelligent traffic video analysis and safety index telemetry pipeline.",
    version="2.0.0"
)

# Robust CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Core API Endpoints -----------------

@app.get("/health", response_model=HealthResponse)
def health_check():
    """Returns the operational status of the server and ML models."""
    models_info = registry.get_models_info()
    loaded_models = [m["name"] for m in models_info if m["is_loaded"]]
    classes = []
    if models_info and models_info[0]["classes"]:
        classes = models_info[0]["classes"]

    return HealthResponse(
        status="online",
        engine="YOLOv8",
        device=registry.device,
        models_loaded=loaded_models,
        classes=classes,
        timestamp=datetime.now().isoformat()
    )

@app.get("/api/models", response_model=List[ModelInfo])
def get_models():
    """Returns registered models and their actual loaded state."""
    models = registry.get_models_info()
    return [
        ModelInfo(
            name=m["name"],
            architecture=m["architecture"],
            weights_path=m["weights_path"],
            classes=m["classes"],
            device=m["device"],
            is_loaded=m["is_loaded"]
        ) for m in models
    ]

@app.post("/predict", response_model=ImagePredictResponse)
async def predict_image(
    file: UploadFile = File(...),
    conf: float = 0.25,
    iou: float = 0.45
):
    """Executes genuine YOLOv8 inference on a single uploaded traffic image."""
    model = registry.get_model()
    if model is None:
        raise HTTPException(status_code=503, detail="YOLO model is not loaded or weights are missing.")

    start_t = time.time()
    try:
        content = await file.read()
        image = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {e}")

    results = model.predict(image, conf=conf, iou=iou, verbose=False)
    infer_time = round((time.time() - start_t) * 1000, 1)

    res = results[0]
    detections = []
    class_counts = {}
    veh_count = 0
    ped_count = 0

    if res.boxes is not None:
        boxes = res.boxes.xyxy.cpu().numpy()
        confs = res.boxes.conf.cpu().numpy()
        classes = res.boxes.cls.cpu().numpy()

        for box, c_val, cls_idx in zip(boxes, confs, classes):
            cname = model.names.get(int(cls_idx), f"Class_{int(cls_idx)}")
            class_counts[cname] = class_counts.get(cname, 0) + 1
            if cname.lower() in ["person", "pedestrian"]:
                ped_count += 1
            else:
                veh_count += 1

            detections.append(DetectionItem(
                bbox=[float(x) for x in box],
                confidence=round(float(c_val), 3),
                class_name=cname
            ))

    return ImagePredictResponse(
        total_detections=len(detections),
        vehicle_count=veh_count,
        pedestrian_count=ped_count,
        class_counts=class_counts,
        detections=detections,
        inference_time_ms=infer_time
    )

@app.post("/api/video/analyze")
async def analyze_video(
    file: UploadFile = File(...),
    conf: float = Form(0.25),
    iou: float = Form(0.45)
):
    """
    Accepts video upload, validates format and limits,
    spawns background pipeline, and immediately returns a job ID.
    """
    job_id, job_dir = video_service.create_job()
    
    # Save & validate video
    video_path = await video_service.save_uploaded_video(file, job_dir)

    # Register in pipeline
    job_info = pipeline.register_job(job_id, file.filename or "video.mp4")

    # Launch background tracking & analysis
    pipeline.submit_job(job_id, video_path, conf=conf, iou=iou)

    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Video accepted. Processing pipeline dispatched.",
        "poll_url": f"/api/jobs/{job_id}",
        "created_at": job_info["created_at"]
    }

@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str):
    """Polls real-time progress and status of a video processing job."""
    job = pipeline.get_job_status(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    return JobStatusResponse(
        job_id=job["job_id"],
        status=job["status"],
        progress=job["progress"],
        current_frame=job.get("current_frame", 0),
        total_frames=job.get("total_frames", 0),
        fps=job.get("fps", 0.0),
        elapsed_seconds=job.get("elapsed_seconds", 0.0),
        eta_seconds=job.get("eta_seconds"),
        error_message=job.get("error_message"),
        created_at=job.get("created_at", ""),
        completed_at=job.get("completed_at")
    )

@app.get("/api/jobs/{job_id}/results")
def get_job_results(job_id: str):
    """Retrieves computed traffic analytics for a completed job."""
    res = pipeline.get_job_results(job_id)
    if not res:
        status_info = pipeline.get_job_status(job_id)
        if status_info and status_info.get("status") in ["queued", "processing"]:
            return JSONResponse(
                status_code=202,
                content={"job_id": job_id, "status": status_info["status"], "progress": status_info["progress"], "message": "Job is still processing."}
            )
        raise HTTPException(status_code=404, detail=f"Results for job '{job_id}' not found or failed.")
    return res

@app.api_route("/api/jobs/{job_id}/video", methods=["GET", "HEAD"])
def get_job_video(job_id: str, request: Request):
    """
    Streams the annotated MP4 video with HTTP 206 Partial Content support
    allowing smooth seeking and HTML5 video playback.
    """
    video_path = video_service.get_job_video_path(job_id)
    if not video_path or not video_path.exists():
        raise HTTPException(status_code=404, detail="Annotated video not available for this job.")

    file_size = video_path.stat().st_size

    if request.method == "HEAD":
        return Response(
            status_code=200,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Content-Type": "video/mp4"
            }
        )

    range_header = request.headers.get("range")

    if not range_header:
        return FileResponse(video_path, media_type="video/mp4", filename=f"annotated_{job_id}.mp4")

    # Handle Range Header
    try:
        byte_range = range_header.replace("bytes=", "").split("-")
        start = int(byte_range[0])
        end = int(byte_range[1]) if byte_range[1] else file_size - 1
    except ValueError:
        return FileResponse(video_path, media_type="video/mp4")

    chunk_size = (end - start) + 1

    def iterfile():
        with open(video_path, "rb") as f:
            f.seek(start)
            bytes_left = chunk_size
            while bytes_left > 0:
                read_size = min(bytes_left, 1024 * 1024)
                data = f.read(read_size)
                if not data:
                    break
                bytes_left -= len(data)
                yield data

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_size),
        "Content-Type": "video/mp4"
    }

    return StreamingResponse(iterfile(), status_code=status.HTTP_206_PARTIAL_CONTENT, headers=headers)

@app.get("/sample-image")
def get_sample_image():
    """Serves local traffic sample image for immediate one-click testing."""
    sample_path = settings.MODEL_DIR / "labels.jpg"
    if sample_path.exists():
        return FileResponse(sample_path, media_type="image/jpeg", filename="sample_traffic.jpg")
    raise HTTPException(status_code=404, detail="Sample image not found on server.")

@app.get("/sample-video")
def get_sample_video():
    """Serves local traffic sample video for immediate one-click testing."""
    sample_path = settings.PROJECT_ROOT / "test_traffic.mp4"
    if sample_path.exists():
        return FileResponse(sample_path, media_type="video/mp4", filename="sample_traffic.mp4")
    raise HTTPException(status_code=404, detail="Sample video not found on server.")

# ----------------- Website & Static Asset Serving -----------------

@app.get("/")
def serve_home():
    html_file = settings.WEBSITE_DIR / "trafficcalc.html"
    if html_file.exists():
        return FileResponse(html_file)
    return {"message": "NeuralTraffic AI API is running."}

@app.get("/{file_name}")
def serve_static_root_file(file_name: str):
    target = settings.WEBSITE_DIR / file_name
    if target.is_file():
        media_types = {
            ".css": "text/css",
            ".js": "application/javascript",
            ".html": "text/html",
            ".json": "application/json",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".svg": "image/svg+xml"
        }
        return FileResponse(target, media_type=media_types.get(target.suffix.lower()))
    raise HTTPException(status_code=404, detail="Asset not found")

if __name__ == "__main__":
    import uvicorn
    print(f"Starting {settings.PROJECT_NAME} on http://{settings.HOST}:{settings.PORT}...")
    uvicorn.run("backend.main:app", host=settings.HOST, port=settings.PORT, reload=True)
