import os
from pathlib import Path
from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    PROJECT_NAME: str = "NeuralTraffic AI"
    PROJECT_ROOT: Path = PROJECT_ROOT
    MODEL_DIR: Path = PROJECT_ROOT / "model"
    WEBSITE_DIR: Path = PROJECT_ROOT / "website"
    MODEL_PATH: Path = MODEL_DIR / "best.pt"
    
    # Storage
    STORAGE_DIR: Path = PROJECT_ROOT / "storage"
    JOBS_DIR: Path = STORAGE_DIR / "jobs"
    
    # Video constraints
    MAX_VIDEO_SIZE_MB: int = 500
    MAX_VIDEO_DURATION_SEC: int = 600
    ALLOWED_VIDEO_EXTENSIONS: set = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".mpeg", ".mpg"}
    
    # Video inference & tracking calibration
    DEFAULT_CONFIDENCE: float = 0.25
    DEFAULT_IOU: float = 0.45
    PIXEL_TO_METER: float = 0.05
    PED_PIXEL_TO_METER: float = 0.03
    DEFAULT_SPEED_LIMIT_KMH: float = 30.0
    LINE_POSITION_RATIO: float = 0.58
    TTC_CONFLICT_THRESHOLD_SEC: float = 2.5
    
    # Concurrency and device
    MAX_CONCURRENT_JOBS: int = 2
    DEVICE: str = "cpu"  # Auto-detected if cuda available
    
    # Host settings
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    CORS_ORIGINS: list = ["*"]
    
    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()

# Ensure directories exist
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
settings.JOBS_DIR.mkdir(parents=True, exist_ok=True)
