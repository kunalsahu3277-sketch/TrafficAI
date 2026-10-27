import cv2
import math
from ultralytics import YOLO

# ---------------- CONFIG ----------------
VIDEO_PATH = "6666.mp4"
MODEL_PATH = "runs/detect/train/weights/best.pt"

CONF = 0.3   # ✅ balanced detection
LINE_THICKNESS = 2
DISPLAY_SCALE = 0.6

PIXEL_TO_METER = 0.05

VEHICLE_CLASSES = [2, 3, 5, 7]  # car, bike, bus, truck
LINE_OFFSET = 8

# ----------------------------------------

model = YOLO(MODEL_PATH)
cap = cv2.VideoCapture(VIDEO_PATH)

FPS = cap.get(cv2.CAP_PROP_FPS)
if FPS == 0:
    FPS = 30

track_history = {}
speed_data = {}
time_data = {}

counted_ids = set()
vehicle_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    h, w, _ = frame.shape
    LINE_Y = int(h * 0.58)

    results = model.track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        conf=CONF
    )

    # 🔴 Draw line
    cv2.line(frame, (0, LINE_Y), (w, LINE_Y), (0, 0, 255), LINE_THICKNESS)

    if results and results[0].boxes.id is not None:

        boxes = results[0].boxes.xyxy.cpu().numpy()
        ids = results[0].boxes.id.cpu().numpy()
        classes = results[0].boxes.cls.cpu().numpy()

        for box, tid, cls in zip(boxes, ids, classes):

            tid = int(tid)
            cls = int(cls)

            if cls not in VEHICLE_CLASSES:
                continue

            x1, y1, x2, y2 = map(int, box)

            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            # init
            if tid not in speed_data:
                speed_data[tid] = []
                time_data[tid] = 0

            if tid in track_history:
                px, py = track_history[tid]

                # -------- SPEED --------
                dist_pixels = math.hypot(cx - px, cy - py)

                if dist_pixels < 1:
                    speed = 0
                else:
                    speed = dist_pixels * PIXEL_TO_METER * FPS * 3.6

                speed_data[tid].append(speed)
                time_data[tid] += 1/FPS

                # -------- COUNTING --------
                if (py < LINE_Y - LINE_OFFSET and cy >= LINE_Y + LINE_OFFSET) or \
                   (py > LINE_Y + LINE_OFFSET and cy <= LINE_Y - LINE_OFFSET):

                    if tid not in counted_ids:
                        counted_ids.add(tid)
                        vehicle_count += 1

                        # highlight
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)

            track_history[tid] = (cx, cy)

            # draw
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0,255,0), 2)
            cv2.circle(frame, (cx, cy), 3, (255,0,0), -1)

            cv2.putText(frame, f"ID:{tid}", (x1, y1-10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 2)

    # show count
    cv2.putText(frame, f"Vehicle Count: {vehicle_count}", (20,40),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0,255,0), 3)

    display = cv2.resize(frame,
                         (int(w * DISPLAY_SCALE),
                          int(h * DISPLAY_SCALE)))

    cv2.imshow("FINAL SYSTEM", display)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()

# -------- FINAL OUTPUT --------
print("\n===== FINAL RESULT =====")

for tid in counted_ids:
    speeds = speed_data.get(tid, [])
    total_time = time_data.get(tid, 0)

    if len(speeds) > 0:
        avg_speed = sum(speeds) / len(speeds)

        print(f"Vehicle ID {tid}")
        print(f"Avg Speed: {avg_speed:.2f} km/h")
        print(f"Time: {total_time:.2f} sec")
        print("-" * 30)

print("Total Vehicle Count:", vehicle_count)