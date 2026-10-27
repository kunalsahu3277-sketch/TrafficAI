import sys
from pathlib import Path

# Ensure project root is in python path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.main import app

if __name__ == "__main__":
    import uvicorn
    print("Starting NeuralTraffic AI Server via model/main.py entrypoint...")
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)