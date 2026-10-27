# FinaLminiproject
final mini project of my semester

## Run the website with the model

From this `model` directory, install the dependencies and start the API:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The API serves `website/trafficcalc.html` at `/`, so its health check and image/video prediction endpoints share the website's origin. The model weights are loaded from `best.pt` in this directory.

## Video analysis API

The `/predict-video` endpoint accepts a video file in the `file` multipart field and an optional `conf` query parameter, matching the image endpoint's confidence threshold. Supported formats are MP4, MOV, AVI, MKV, WEBM and MPEG; uploads are limited to 500 MB. The model samples at about one frame per second, with wider spacing for long videos and a maximum of 300 sampled frames. Returned class counts are detections across sampled frames, not unique tracked vehicles.
