import cv2
import numpy as np
from ultralytics import YOLO

# ---------------- CONFIG ----------------
VIDEO_PATH = "MVI_8437.mp4"
MODEL_PATH = "yolov8n.pt"

FPS = 30
PIXEL_TO_METER = 0.05

CONF_THRESHOLD = 0.4

LINE_Y = 300   # horizontal
LINE_X = 500   # vertical

MIN_MOVEMENT = 2

VEHICLE_CLASSES = [2, 3, 5, 7]
# ----------------------------------------

model = YOLO(MODEL_PATH)
cap = cv2.VideoCapture(VIDEO_PATH)

prev_positions = {}
speed_data = {}
time_data = {}

counted_horizontal = set()
counted_vertical = set()

h_count = 0
v_count = 0

all_ids = set()

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

            if int(cls) not in VEHICLE_CLASSES:
                continue

            all_ids.add(track_id)

            x1, y1, x2, y2 = map(int, box)
            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)

            cv2.rectangle(frame, (x1, y1), (x2, y2), (0,255,0), 2)
            cv2.circle(frame, (cx, cy), 4, (0,255,255), -1)

            if track_id not in speed_data:
                speed_data[track_id] = []
                time_data[track_id] = 0

            if track_id in prev_positions:
                prev_x, prev_y = prev_positions[track_id]

                # -------- SPEED --------
                dist = np.sqrt((cx - prev_x)**2 + (cy - prev_y)**2)

                if dist < MIN_MOVEMENT:
                    speed = 0
                else:
                    speed = (dist * PIXEL_TO_METER) * FPS

                if len(speed_data[track_id]) > 0:
                    speed = 0.7 * speed_data[track_id][-1] + 0.3 * speed

                speed_data[track_id].append(speed)
                time_data[track_id] += 1/FPS

                cv2.putText(frame, f"{speed:.2f} m/s", (x1, y1-30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,0,0), 2)

                # -------- ✅ FIXED HORIZONTAL COUNT --------
                if (prev_y < LINE_Y and cy >= LINE_Y) or (prev_y > LINE_Y and cy <= LINE_Y):
                    if track_id not in counted_horizontal:
                        counted_horizontal.add(track_id)
                        h_count += 1
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0,0,255), 3)

                # -------- ✅ FIXED VERTICAL COUNT --------
                if (prev_x < LINE_X and cx >= LINE_X) or (prev_x > LINE_X and cx <= LINE_X):
                    if track_id not in counted_vertical:
                        counted_vertical.add(track_id)
                        v_count += 1
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (255,0,255), 3)

            prev_positions[track_id] = (cx, cy)

            cv2.putText(frame, f"ID:{int(track_id)}", (x1, y1-10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 2)

    # -------- DRAW LINES --------
    cv2.line(frame, (0, LINE_Y), (1020, LINE_Y), (0,0,255), 3)
    cv2.line(frame, (LINE_X, 0), (LINE_X, 500), (255,0,255), 3)

    cv2.putText(frame, f"H Count: {h_count}", (30,50),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0,0,255), 2)

    cv2.putText(frame, f"V Count: {v_count}", (30,100),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255,0,255), 2)

    cv2.imshow("JUNCTION SYSTEM", frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()

# -------- FINAL OUTPUT --------
print("\n===== FINAL RESULT =====")

for track_id in sorted(all_ids):
    speeds = speed_data.get(track_id, [])
    total_time = time_data.get(track_id, 0)

    if len(speeds) > 0:
        avg_speed = sum(speeds) / len(speeds)
        avg_time = total_time / len(speeds)

        print(f"\nVehicle ID {int(track_id)}:")
        print(f"  Avg Speed: {avg_speed:.2f} m/s")
        print(f"  Total Time: {total_time:.2f} sec")
        print(f"  Avg Time: {avg_time:.4f} sec")
        print("-" * 30)

print("\n===== COUNTS =====")
print(f"Horizontal Count: {h_count}")
print(f"Vertical Count: {v_count}")