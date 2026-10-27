from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime

class HealthResponse(BaseModel):
    status: str = "online"
    engine: str = "YOLOv8"
    device: str
    models_loaded: List[str]
    classes: List[str]
    timestamp: str

class ModelInfo(BaseModel):
    name: str
    architecture: str
    weights_path: str
    classes: List[str]
    device: str
    is_loaded: bool
    version: Optional[str] = None
    input_size: int = 640

class DetectionItem(BaseModel):
    bbox: List[float] = Field(..., description="[x1, y1, x2, y2] coordinates")
    confidence: float
    class_name: str
    track_id: Optional[int] = None
    speed_kmh: Optional[float] = None

class ImagePredictResponse(BaseModel):
    total_detections: int
    vehicle_count: int
    pedestrian_count: int
    class_counts: Dict[str, int]
    detections: List[DetectionItem]
    inference_time_ms: float

class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # "queued", "processing", "completed", "failed"
    progress: float = Field(0.0, description="Percentage completed (0.0 to 100.0)")
    current_frame: int = 0
    total_frames: int = 0
    fps: float = 0.0
    elapsed_seconds: float = 0.0
    eta_seconds: Optional[float] = None
    error_message: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None

class SpeedAnalytics(BaseModel):
    avg_speed_kmh: float
    max_speed_kmh: float
    speed_limit_kmh: float
    speed_compliance_rate: float
    speed_distribution: Dict[str, int]
    speed_violations_count: int

class PedestrianAnalytics(BaseModel):
    total_pedestrians: int
    avg_walk_speed_mps: float
    max_walk_speed_mps: float
    avg_wait_time_sec: float
    crossing_counts_by_arm: Dict[str, int]

class TrafficDensityAnalytics(BaseModel):
    avg_vehicles_per_frame: float
    peak_vehicles_per_frame: int
    density_level: str  # "Low", "Moderate", "High", "Congested"

class ConflictAnalytics(BaseModel):
    total_conflicts: int
    min_ttc_seconds: float
    vehicle_pedestrian_conflicts: int
    vehicle_vehicle_conflicts: int
    pedestrian_pedestrian_conflicts: int
    heatmap_5x5: List[float]

class SafetyIndices(BaseModel):
    PSI: float = Field(..., description="Pedestrian Safety Index (0-100)")
    SRI: float = Field(..., description="Speed Risk Index (Speed / Limit)")
    CRI: float = Field(..., description="Conflict Risk Index")
    PRI: float = Field(..., description="Pedestrian Risk Index")
    PEI: float = Field(..., description="Pedestrian Exposure Index")
    psi_band: str
    psi_recommendation: str

class JobResultResponse(BaseModel):
    job_id: str
    status: str
    filename: str
    video_metadata: Dict[str, Any]
    counts: Dict[str, Any]
    composition: List[Dict[str, Any]]
    speed_analytics: SpeedAnalytics
    pedestrian_analytics: PedestrianAnalytics
    traffic_density: TrafficDensityAnalytics
    conflict_analytics: ConflictAnalytics
    safety_indices: SafetyIndices
    annotated_video_url: Optional[str] = None
    processing_time_sec: float
