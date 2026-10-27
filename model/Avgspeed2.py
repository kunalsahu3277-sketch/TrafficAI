import cv2
import numpy as np
from ultralytics import YOLO

# ---------------- CONFIG ----------------
VIDEO_PATH = "6666.mp4"
MODEL_PATH = "yolov8n.pt"

CONF_THRESHOLD = 0.4
LINE_POSITION = 296

PIXEL_TO_METER = 0.05
VEHICLE_CLASSES = [2, 3, 5, 7]

# ----------------------------------------

model = YOLO(MODEL_PATH)
cap = cv2.VideoCapture(VIDEO_PATH)

FPS = cap.get(cv2.CAP_PROP_FPS)
if FPS == 0:
    FPS = 30

prev_positions = {}

speed_data = {}
time_data = {}

counted_ids = set()
vehicle_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.resize(frame, (1020, 500))

    results = model.track(frame, persist=True, conf=CONF_THRESHOLD)

    if results[0].boxes.id is not None:
        boxes = results[0].boxes.xyxy.cpu().numpy()
        ids = results[0].boxes.id.cpu().numpy()
        classes = results[0].boxes.cls.cpu().numpy()

        for box, track_id, cls in zip(boxes, ids, classes):

            if int(cls) not in VEHICLE_CLASSES:
                continue

            x1, y1, x2, y2 = map(int, box)

            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)

            # Draw box & centroid
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0,255,0), 2)
            cv2.circle(frame, (cx, cy), 4, (0,255,0), -1)

            # Initialize
            if track_id not in speed_data:
                speed_data[track_id] = []
                time_data[track_id] = 0

            # ---------------- SPEED CALC ----------------
            if track_id in prev_positions:
                prev_x, prev_y = prev_positions[track_id]

                dist_pixels = np.sqrt((cx - prev_x)**2 + (cy - prev_y)**2)
                dist_meters = dist_pixels * PIXEL_TO_METER
                raw_speed = dist_meters * FPS

                # 🚨 SMART SPEED FIX
                if dist_pixels < 1:
                    speed = 0
                else:
                    if len(speed_data[track_id]) > 0:
                        prev_speed = speed_data[track_id][-1]
                        speed = 0.7 * prev_speed + 0.3 * raw_speed
                    else:
                        speed = raw_speed

                speed_data[track_id].append(speed)
                time_data[track_id] += 1/FPS

                # Show speed
                cv2.putText(frame, f"{speed:.2f} m/s", (x1, y1-30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,0,0), 2)

                # ---------------- COUNTING ----------------
                if ((prev_y < LINE_POSITION and cy >= LINE_POSITION) or
                    (prev_y > LINE_POSITION and cy <= LINE_POSITION)):

                    if track_id not in counted_ids:
                        counted_ids.add(track_id)
                        vehicle_count += 1

                        # Highlight counted vehicle
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0,0,255), 3)

            prev_positions[track_id] = (cx, cy)

            # Show ID
            cv2.putText(frame, f"ID:{int(track_id)}", (x1, y1-10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 2)

    # Draw counting line
    cv2.line(frame, (0, LINE_POSITION), (1020, LINE_POSITION), (0,0,255), 2)
    cv2.putText(frame, "COUNT LINE", (420, LINE_POSITION - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)

    # Show count
    cv2.putText(frame, f"Vehicle Count: {vehicle_count}", (30,50),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255,0,0), 3)

    cv2.imshow("FINAL SYSTEM", frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()

# ---------------- FINAL OUTPUT ----------------
print("\n===== FINAL RESULT (COUNTED VEHICLES ONLY) =====")

for track_id in counted_ids:

    speeds = speed_data.get(track_id, [])
    total_time = time_data.get(track_id, 0)

    if len(speeds) > 0:
        avg_speed = sum(speeds) / len(speeds)

        print(f"Vehicle ID {int(track_id)}:")
        print(f"  Avg Speed: {avg_speed:.2f} m/s")
        print(f"  Total Time: {total_time:.2f} sec")
        print("-" * 30)

print(f"\nTotal Vehicle Count: {vehicle_count}")