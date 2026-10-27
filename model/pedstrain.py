import cv2
import numpy as np
from ultralytics import YOLO

# ---------------- CONFIG ----------------
VIDEO_PATH = "6666.mp4"
MODEL_PATH = "yolov8n.pt"

CONF_THRESHOLD = 0.3
PIXEL_TO_METER = 0.03

TARGET_CLASS = 0  # person
# ----------------------------------------

# ---------------- INIT ----------------
model = YOLO(MODEL_PATH)
cap = cv2.VideoCapture(VIDEO_PATH)

FPS = cap.get(cv2.CAP_PROP_FPS)
if FPS == 0:
    FPS = 30

prev_positions = {}
speed_data = {}
time_data = {}

all_ids = set()   # store all detected IDs

# ---------------- LOOP ----------------
while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.resize(frame, (1020, 500))

    results = model.track(frame, persist=True, conf=CONF_THRESHOLD, tracker="bytetrack.yaml")

    if results[0].boxes.id is not None:
        boxes = results[0].boxes.xyxy.cpu().numpy()
        ids = results[0].boxes.id.cpu().numpy()
        classes = results[0].boxes.cls.cpu().numpy()

        for box, track_id, cls in zip(boxes, ids, classes):
            if int(cls) != TARGET_CLASS:
                continue

            all_ids.add(track_id)

            x1, y1, x2, y2 = map(int, box)
            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)

            # Draw bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0,255,255), 2)
            cv2.circle(frame, (cx, cy), 4, (0,255,255), -1)

            # Initialize
            if track_id not in speed_data:
                speed_data[track_id] = []
                time_data[track_id] = 0

            if track_id in prev_positions:
                prev_x, prev_y = prev_positions[track_id]

                # -------- SPEED --------
                dist = np.sqrt((cx - prev_x)**2 + (cy - prev_y)**2)
                speed = (dist * PIXEL_TO_METER) * FPS

                # Smooth speed
                if len(speed_data[track_id]) > 0:
                    speed = 0.7 * speed_data[track_id][-1] + 0.3 * speed

                # Store data
                speed_data[track_id].append(speed)
                time_data[track_id] += 1 / FPS

                # Show speed
                cv2.putText(frame, f"{speed:.2f} m/s", (x1, y1-20),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,0,0), 2)

            prev_positions[track_id] = (cx, cy)

            # Show ID
            cv2.putText(frame, f"ID:{int(track_id)}", (x1, y1-5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,255), 2)

    cv2.imshow("PEDESTRIAN SYSTEM", frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()

# -------- FINAL OUTPUT --------
print("\n===== FINAL RESULT (ALL PEDESTRIANS) =====")

for track_id in sorted(all_ids):
    speeds = speed_data.get(track_id, [])
    total_time = time_data.get(track_id, 0)

    if len(speeds) > 0:
        avg_speed = sum(speeds) / len(speeds)
        avg_time = total_time / len(speeds)

        print(f"\nPedestrian ID {int(track_id)}:")
        print(f"  Avg Speed: {avg_speed:.2f} m/s")
        print(f"  Total Time: {total_time:.2f} sec")
        print(f"  Avg Time: {avg_time:.4f} sec")
        print("-" * 30)