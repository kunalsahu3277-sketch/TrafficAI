import cv2
import numpy as np
from ultralytics import YOLO

# ---------------- CONFIG ----------------
VIDEO_PATH = "MVI_8437.mp4"
MODEL_PATH = "yolov8n.pt"

CONF_THRESHOLD = 0.4

# Lane-based counting lines
LINE_Y1 = 300   # Near lane
LINE_Y2 = 220   # Far lane

# Vertical reference line (thick)
LINE_X = 510

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

# Lane-wise counting
counted_lane1_ids = set()
counted_lane2_ids = set()

count_lane1 = 0
count_lane2 = 0

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

            # ---------------- SPEED ----------------
            if track_id in prev_positions:
                prev_x, prev_y = prev_positions[track_id]

                dist_pixels = np.sqrt((cx - prev_x)**2 + (cy - prev_y)**2)
                dist_meters = dist_pixels * PIXEL_TO_METER
                raw_speed = dist_meters * FPS

                if dist_pixels < 1:
                    speed = 0
                else:
                    if len(speed_data[track_id]) > 0:
                        prev_speed = speed_data[track_id][-1]
                        speed = 0.7 * prev_speed + 0.3 * raw_speed
                    else:
                        speed = raw_speed

                # ---------------- COUNTING ----------------

                # Lane 1 (near)
                if ((prev_y < LINE_Y1 and cy >= LINE_Y1) or
                    (prev_y > LINE_Y1 and cy <= LINE_Y1)):

                    if track_id not in counted_lane1_ids:
                        counted_lane1_ids.add(track_id)
                        count_lane1 += 1
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0,0,255), 3)

                # Lane 2 (far)
                if ((prev_y < LINE_Y2 and cy >= LINE_Y2) or
                    (prev_y > LINE_Y2 and cy <= LINE_Y2)):

                    if track_id not in counted_lane2_ids:
                        counted_lane2_ids.add(track_id)
                        count_lane2 += 1
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (255,255,0), 3)

                # Store speed ONLY for counted vehicles
                if (track_id in counted_lane1_ids or
                    track_id in counted_lane2_ids):

                    speed_data[track_id].append(speed)
                    time_data[track_id] += 1/FPS

                # Show speed
                cv2.putText(frame, f"{speed:.2f} m/s", (x1, y1-30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,0,0), 2)

            prev_positions[track_id] = (cx, cy)

            # Show ID
            cv2.putText(frame, f"ID:{int(track_id)}", (x1, y1-10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 2)

    # ---------------- DRAW LINES ----------------

    # Lane 1 line
    cv2.line(frame, (0, LINE_Y1), (1020, LINE_Y1), (0,0,255), 2)
    cv2.putText(frame, "LANE 1", (400, LINE_Y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)

    # Lane 2 line
    cv2.line(frame, (0, LINE_Y2), (1020, LINE_Y2), (255,255,0), 2)
    cv2.putText(frame, "LANE 2", (400, LINE_Y2 - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,0), 2)

    # 👉 Thick vertical reference line
    cv2.line(frame, (LINE_X, 0), (LINE_X, 500), (255,0,255), 5)
    cv2.putText(frame, "REF", (LINE_X + 10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,0,255), 2)

    # ---------------- COUNTS ----------------

    cv2.putText(frame, f"Lane1 Count: {count_lane1}", (30,50),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255,0,0), 3)

    cv2.putText(frame, f"Lane2 Count: {count_lane2}", (30,100),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0,255,255), 3)

    cv2.imshow("FINAL SYSTEM", frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()

# ---------------- FINAL OUTPUT ----------------

print("\n===== FINAL RESULT (ONLY COUNTED VEHICLES) =====")

all_counted_ids = counted_lane1_ids.union(counted_lane2_ids)

for track_id in all_counted_ids:

    speeds = speed_data.get(track_id, [])
    total_time = time_data.get(track_id, 0)

    if len(speeds) > 0:
        avg_speed = sum(speeds) / len(speeds)

        print(f"Vehicle ID {int(track_id)}:")
        print(f"  Avg Speed: {avg_speed:.2f} m/s")
        print(f"  Total Time: {total_time:.2f} sec")
        print("-" * 30)

print(f"\nLane1 Count: {count_lane1}")
print(f"Lane2 Count: {count_lane2}")
print(f"Total Unique Vehicles: {len(all_counted_ids)}")