import cv2
import numpy as np
from ultralytics import YOLO
from collections import defaultdict

# ---------------- CONFIG ----------------
PIXEL_TO_METER = 0.1      # ⚠️ Adjust for your camera calibration
FRAME_GAP = 12            # Larger gap = more stable speed
MAX_SPEED = 120           # km/h cap
SMOOTHING_WINDOW = 5      # Moving average window
STOP_FRAMES = 10          # Frames required to confirm stop
STOP_THRESHOLD = 2        # Speed below this = considered stopped
DISPLAY_SCALE = 0.4

# ---------------- LOAD MODEL ----------------
model = YOLO("yolov8n.pt")

# ---------------- LOAD VIDEO ----------------
cap = cv2.VideoCapture("6666.mp4")

if not cap.isOpened():
    print("❌ Cannot open video")
    exit()

fps = cap.get(cv2.CAP_PROP_FPS)

if fps == 0:
    fps = 30  # fallback if metadata fails

print("FPS:", fps)

# ---------------- STORAGE ----------------
track_history = defaultdict(list)
vehicle_speed = {}
speed_buffer = defaultdict(list)
stop_counter = defaultdict(int)

# ---------------- PROCESS VIDEO ----------------
while True:
    ret, frame = cap.read()
    if not ret:
        print("✅ Video finished")
        break

    results = model.track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        classes=[2, 3, 5, 7]  # car, bike, bus, truck
    )

    if results[0].boxes.id is not None:
        boxes = results[0].boxes.xyxy.cpu().numpy()
        ids = results[0].boxes.id.cpu().numpy()

        for box, track_id in zip(boxes, ids):

            track_id = int(track_id)
            x1, y1, x2, y2 = box

            # Calculate centroid
            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)

            track_history[track_id].append((cx, cy))

            # Limit history size
            if len(track_history[track_id]) > 30:
                track_history[track_id].pop(0)

            # ---------------- SPEED CALCULATION ----------------
            if len(track_history[track_id]) >= FRAME_GAP:

                x_prev, y_prev = track_history[track_id][-FRAME_GAP]
                x_curr, y_curr = track_history[track_id][-1]

                # Use only vertical movement (more stable)
                pixel_dist = abs(y_curr - y_prev)

                time_sec = FRAME_GAP / fps
                raw_speed = (pixel_dist * PIXEL_TO_METER / time_sec) * 3.6
                raw_speed = min(raw_speed, MAX_SPEED)

                # ---- SMOOTHING ----
                speed_buffer[track_id].append(raw_speed)

                if len(speed_buffer[track_id]) > SMOOTHING_WINDOW:
                    speed_buffer[track_id].pop(0)

                smooth_speed = sum(speed_buffer[track_id]) / len(speed_buffer[track_id])

                # ---- STOP DETECTION ----
                if smooth_speed < STOP_THRESHOLD:
                    stop_counter[track_id] += 1
                else:
                    stop_counter[track_id] = 0

                if stop_counter[track_id] > STOP_FRAMES:
                    smooth_speed = 0

                vehicle_speed[track_id] = round(smooth_speed, 2)

            # ---------------- DISPLAY ----------------
            speed_to_show = vehicle_speed.get(track_id, 0)

            if speed_to_show == 0:
                color = (0, 0, 255)   # Red for stopped
                label = f"ID:{track_id} Speed:0 (Stopped)"
            else:
                color = (0, 255, 0)   # Green for moving
                label = f"ID:{track_id} Speed:{speed_to_show} km/h"

            cv2.rectangle(
                frame,
                (int(x1), int(y1)),
                (int(x2), int(y2)),
                color,
                2
            )

            cv2.putText(
                frame,
                label,
                (int(x1), int(y1) - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                color,
                2
            )

    # Resize for display
    frame = cv2.resize(frame, None, fx=DISPLAY_SCALE, fy=DISPLAY_SCALE)


    cv2.imshow("Vehicle Speed Detection", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ---------------- CLEANUP ----------------
cap.release()
cv2.destroyAllWindows()