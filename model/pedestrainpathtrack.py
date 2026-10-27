import cv2
import numpy as np
from ultralytics import YOLO

# ---------------- CONFIG ----------------
VIDEO_PATH = "6666.mp4"
MODEL_PATH = "yolov8n.pt"

CONF_THRESHOLD = 0.3
PIXEL_TO_METER = 0.03

# Diagonal counting line
LINE_P1 = (100, 400)
LINE_P2 = (900, 200)
OFFSET = 10

# Vertical counting line
LINE_X = 510

TARGET_CLASS = 0  # person
# ----------------------------------------

def get_side(px, py, x1, y1, x2, y2):
    return (px - x1)*(y2 - y1) - (py - y1)*(x2 - x1)

# ---------------- INIT ----------------
model = YOLO(MODEL_PATH)
cap = cv2.VideoCapture(VIDEO_PATH)

FPS = cap.get(cv2.CAP_PROP_FPS)
if FPS == 0:
    FPS = 30

prev_positions = {}
speed_data = {}
time_data = {}
trajectory_data = {}  # <-- store path of each pedestrian

counted_horizontal_ids = set()
counted_vertical_ids = set()
count_horizontal = 0
count_vertical = 0

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

            x1, y1, x2, y2 = map(int, box)
            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)

            # Draw box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0,255,255), 2)
            cv2.circle(frame, (cx, cy), 4, (0,255,255), -1)

            # Initialize
            if track_id not in speed_data:
                speed_data[track_id] = []
                time_data[track_id] = 0
                trajectory_data[track_id] = []  # <-- initialize trajectory

            # Append centroid to trajectory
            trajectory_data[track_id].append((cx, cy))

            if track_id in prev_positions:
                prev_x, prev_y = prev_positions[track_id]

                # -------- SPEED --------
                dist = np.sqrt((cx - prev_x)**2 + (cy - prev_y)**2)
                speed = (dist * PIXEL_TO_METER) * FPS
                if len(speed_data[track_id]) > 0:
                    speed = 0.7 * speed_data[track_id][-1] + 0.3 * speed

                # -------- DIAGONAL CROSSING --------
                prev_side = get_side(prev_x, prev_y, *LINE_P1, *LINE_P2)
                curr_side = get_side(cx, cy, *LINE_P1, *LINE_P2)
                if prev_side * curr_side < 0:
                    if track_id not in counted_horizontal_ids:
                        counted_horizontal_ids.add(track_id)
                        count_horizontal += 1
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0,0,255), 3)

                # -------- VERTICAL CROSSING --------
                if (prev_x < LINE_X - OFFSET and cx > LINE_X + OFFSET) or \
                   (prev_x > LINE_X + OFFSET and cx < LINE_X - OFFSET):
                    if track_id not in counted_vertical_ids:
                        counted_vertical_ids.add(track_id)
                        count_vertical += 1
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (255,0,255), 3)

                # Store speed if counted
                if track_id in counted_horizontal_ids or track_id in counted_vertical_ids:
                    speed_data[track_id].append(speed)
                    time_data[track_id] += 1/FPS

                cv2.putText(frame, f"{speed:.2f} m/s", (x1, y1-25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,0,0), 2)

            prev_positions[track_id] = (cx, cy)
            cv2.putText(frame, f"ID:{int(track_id)}", (x1, y1-5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,255), 2)

    # Draw counting lines
    cv2.line(frame, LINE_P1, LINE_P2, (0,0,255), 3)
    cv2.line(frame, (LINE_X,0), (LINE_X,500), (255,0,255), 5)

    # Show counts
    cv2.putText(frame, f"H Count: {count_horizontal}", (30,50),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255,0,0), 3)
    cv2.putText(frame, f"V Count: {count_vertical}", (30,100),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255,0,255), 3)

    # Draw trajectories
    for tid, path in trajectory_data.items():
        for i in range(1, len(path)):
            cv2.line(frame, path[i-1], path[i], (0,255,0), 2)

    cv2.imshow("PEDESTRIAN TRAJECTORY", frame)
    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()

# -------- FINAL REPORT --------
print("\n===== FINAL PEDESTRIAN REPORT =====")
all_ids = counted_horizontal_ids.union(counted_vertical_ids)

for track_id in all_ids:
    speeds = speed_data.get(track_id, [])
    total_time = time_data.get(track_id, 0)
    trajectory = trajectory_data.get(track_id, [])

    if len(speeds) > 0:
        avg_speed = sum(speeds)/len(speeds)
        print(f"Pedestrian ID {int(track_id)}:")
        print(f"  Avg Speed: {avg_speed:.2f} m/s")
        print(f"  Total Time: {total_time:.2f} sec")
        print(f"  Trajectory (centroids): {trajectory}")
        print("-"*40)

print(f"\nHorizontal Count: {count_horizontal}")
print(f"Vertical Count: {count_vertical}")
print(f"Total Unique Pedestrians: {len(all_ids)}")