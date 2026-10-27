import logging
import torch
from pathlib import Path
from typing import Dict, Any, Optional, List
from ultralytics import YOLO

from backend.config import settings

logger = logging.getLogger("neural_traffic.model_registry")

class ModelRegistry:
    _instance = None
    _models: Dict[str, Any] = {}
    _device: str = "cpu"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelRegistry, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        # Determine device
        if torch.cuda.is_available():
            self._device = "cuda"
        else:
            self._device = "cpu"
        logger.info(f"Initialized ModelRegistry with device: {self._device}")
        
        # Preload the primary YOLO model
        self.load_primary_model()

    def load_primary_model(self) -> Optional[YOLO]:
        model_path = Path(settings.MODEL_PATH)
        if not model_path.exists():
            logger.error(f"Primary model weights not found at: {model_path}")
            return None

        try:
            logger.info(f"Loading YOLO weights from {model_path} onto {self._device}...")
            model = YOLO(str(model_path))
            # Test a dummy pass to verify initialization
            self._models["yolov8_primary"] = {
                "instance": model,
                "name": "Traffic AI YOLOv8",
                "architecture": "YOLOv8",
                "weights_path": str(model_path),
                "classes": list(model.names.values()) if hasattr(model, "names") else ["Bike", "Car", "Person", "Truck"],
                "device": self._device,
                "loaded": True
            }
            logger.info(f"Model successfully loaded. Classes: {self._models['yolov8_primary']['classes']}")
            return model
        except Exception as e:
            logger.exception(f"Failed to load primary model weights: {e}")
            self._models["yolov8_primary"] = {
                "instance": None,
                "name": "Traffic AI YOLOv8",
                "architecture": "YOLOv8",
                "weights_path": str(model_path),
                "classes": [],
                "device": self._device,
                "loaded": False,
                "error": str(e)
            }
            return None

    def get_model(self, model_key: str = "yolov8_primary") -> Optional[YOLO]:
        item = self._models.get(model_key)
        if item and item.get("instance") is not None:
            return item["instance"]
        # Try loading if not yet loaded
        if model_key == "yolov8_primary":
            return self.load_primary_model()
        return None

    def get_models_info(self) -> List[Dict[str, Any]]:
        results = []
        for key, data in self._models.items():
            results.append({
                "key": key,
                "name": data.get("name", key),
                "architecture": data.get("architecture", "YOLOv8"),
                "weights_path": data.get("weights_path", ""),
                "classes": data.get("classes", []),
                "device": data.get("device", self._device),
                "is_loaded": data.get("loaded", False),
                "error": data.get("error")
            })
        return results

    @property
    def device(self) -> str:
        return self._device

registry = ModelRegistry()
