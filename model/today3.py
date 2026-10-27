import cv2
import numpy as np
from ultralytics import YOLO

# ---------------- CONFIG ----------------
VIDEO_PATH = "6666.mp4"
MODEL_PATH = "yolov8n.pt"

CONF_THRESHOLD = 0.45
PIXEL_TO_METER = 0.03

PERSON_CLASS = 0
VEHICLE_CLASSES = [2, 3, 5, 7]

MIN_MOVEMENT = 2
DIST_THRESHOLD = 30
# ----------------------------------------

def get_side(px, py, x1, y1, x2, y2):
    return (px - x1)*(y2 - y1) - (py - y1)*(x2 - x1)

def compute_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter = max(0, xB-xA) * max(0, yB-yA)
    areaA = (boxA[2]-boxA[0])*(boxA[3]-boxA[1])
    areaB = (boxB[2]-boxB[0])*(boxB[3]-boxB[1])

    if areaA + areaB - inter == 0:
        return 0
    return inter / (areaA + areaB - inter)

# ---------------- INIT ----------------
model = YOLO(MODEL_PATH)
cap = cv2.VideoCapture(VIDEO_PATH)

FPS = cap.get(cv2.CAP_PROP_FPS)
if FPS == 0:
    FPS = 30

prev_positions = {}
speed_data = {}
time_data = {}

counted_ids = set()
ped_count = 0

# -------- STABLE ID SYSTEM --------
stable_prev_positions = {}
next_id = 1

# -------- DIAGONAL LINE --------
LINE_P1 = (50, 220)
LINE_P2 = (1000, 300)

# ---------------- LOOP ----------------
while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.resize(frame, (1020, 500))

    results = model.track(
        frame,
        persist=True,
        conf=CONF_THRESHOLD,
        iou=0.5,
        tracker="bytetrack.yaml"
    )

    if results[0].boxes.id is not None:

        boxes = results[0].boxes.xyxy.cpu().numpy()
        classes = results[0].boxes.cls.cpu().numpy()

        # -------- VEHICLE BOXES --------
        vehicle_boxes = [box for box, cls in zip(boxes, classes) if int(cls) in VEHICLE_CLASSES]

        for box, cls in zip(boxes, classes):

            if int(cls) != PERSON_CLASS:
                continue

            # -------- REMOVE RIDERS --------
            if any(compute_iou(box, vbox) > 0.3 for vbox in vehicle_boxes):
                continue

            x1, y1, x2, y2 = map(int, box)
            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)

            # -------- STABLE ID ASSIGN --------
            assigned_id = None
            for sid, (px, py) in stable_prev_positions.items():
                if abs(cx - px) < DIST_THRESHOLD and abs(cy - py) < DIST_THRESHOLD:
                    assigned_id = sid
                    break

            if assigned_id is None:
                assigned_id = next_id
                next_id += 1

            track_id = assigned_id

            # Draw
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0,255,255), 2)
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
                time_data[track_id] += 1 / FPS

                # -------- CROSSING --------
                prev_side = get_side(prev_x, prev_y, *LINE_P1, *LINE_P2)
                curr_side = get_side(cx, cy, *LINE_P1, *LINE_P2)

                if prev_side * curr_side < 0:
                    if track_id not in counted_ids:
                        counted_ids.add(track_id)
                        ped_count += 1
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0,0,255), 3)

                cv2.putText(frame, f"{speed:.2f} m/s", (x1, y1-25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,0,0), 2)

            prev_positions[track_id] = (cx, cy)
            stable_prev_positions[track_id] = (cx, cy)

            cv2.putText(frame, f"ID:{track_id}", (x1, y1-5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,255), 2)

    # -------- DRAW LINE --------
    cv2.line(frame, LINE_P1, LINE_P2, (0,0,255), 3)

    cv2.putText(frame, f"Ped Count: {ped_count}", (30,50),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255,0,0), 3)

    cv2.imshow("FINAL PEDESTRIAN SYSTEM", frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()

# -------- FINAL OUTPUT --------
print("\n===== FINAL RESULT =====")

for track_id in sorted(speed_data.keys()):
    speeds = speed_data.get(track_id, [])
    total_time = time_data.get(track_id, 0)

    if len(speeds) > 0:
        avg_speed = sum(speeds) / len(speeds)
        avg_time = total_time / len(speeds)

        print(f"\nPedestrian ID {track_id}:")
        print(f"  Avg Speed: {avg_speed:.2f} m/s")
        print(f"  Total Time: {total_time:.2f} sec")
        print(f"  Avg Time: {avg_time:.4f} sec")
        print("-" * 30)

print(f"\nTotal Pedestrians Counted: {ped_count}")