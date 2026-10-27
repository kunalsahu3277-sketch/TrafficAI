import time
import requests
import sys

def test_pipeline():
    url = "http://127.0.0.1:8000"
    
    print("\n[1/4] Testing /health and /api/models...")
    h = requests.get(f"{url}/health").json()
    assert h["status"] == "online", f"Health status not online: {h}"
    models = requests.get(f"{url}/api/models").json()
    assert len(models) > 0 and models[0]["is_loaded"], f"Models not loaded: {models}"
    print("Health and models OK:", h["models_loaded"], "Classes:", h["classes"])

    print("\n[2/4] Testing image prediction /predict with model/labels.jpg...")
    with open("model/labels.jpg", "rb") as f:
        img_res = requests.post(f"{url}/predict?conf=0.1", files={"file": ("labels.jpg", f, "image/jpeg")}).json()
    assert "total_detections" in img_res
    print(f"Image prediction OK: {img_res['total_detections']} detections ({img_res['inference_time_ms']}ms)")

    print("\n[3/4] Uploading video to /api/video/analyze...")
    with open("test_traffic.mp4", "rb") as f:
        upload_res = requests.post(
            f"{url}/api/video/analyze",
            files={"file": ("test_traffic.mp4", f, "video/mp4")},
            data={"conf": "0.1"}
        )
    assert upload_res.status_code == 200, f"Upload failed: {upload_res.text}"
    job_id = upload_res.json()["job_id"]
    print(f"Video uploaded successfully. Job ID: {job_id}")

    print("\n[4/4] Polling job status...")
    max_wait = 60
    start = time.time()
    final_status = None

    while time.time() - start < max_wait:
        time.sleep(1.5)
        st = requests.get(f"{url}/api/jobs/{job_id}").json()
        status = st.get("status")
        progress = st.get("progress", 0.0)
        curr = st.get("current_frame", 0)
        tot = st.get("total_frames", 0)
        print(f"  Job {job_id}: status={status}, progress={progress:.1f}%, frames={curr}/{tot}")
        if status in ["completed", "failed"]:
            final_status = st
            break

    assert final_status and final_status["status"] == "completed", f"Job did not complete: {final_status}"
    
    # Check results
    results = requests.get(f"{url}/api/jobs/{job_id}/results").json()
    print("\n[SUCCESS] Pipeline Completed with Real Metrics:")
    print("  - Counts:", results["counts"])
    print("  - Speed Analytics:", results["speed_analytics"])
    print("  - Conflict Analytics:", results["conflict_analytics"]["total_conflicts"], "conflicts, min TTC:", results["conflict_analytics"]["min_ttc_seconds"])
    print("  - Safety Indices:", results["safety_indices"])
    print("  - Annotated Video URL:", results["annotated_video_url"])

    # Check video stream response
    vid_res = requests.head(f"{url}{results['annotated_video_url']}")
    assert vid_res.status_code in [200, 206], f"Video stream failed: {vid_res.status_code}"
    print("  - Video stream head check passed:", vid_res.status_code)

if __name__ == "__main__":
    test_pipeline()
