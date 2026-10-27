import cv2
import math
from ultralytics import YOLO

# ---------------- CONFIG ----------------
VIDEO_PATH = "MVI_8427.mp4"
MODEL_PATH = "runs/detect/train/weights/best.pt"

LINE_THICKNESS = 3

PIXEL_TO_METER = 0.05
FPS = 30
DISPLAY_SCALE = 0.4
# ----------------------------------------

# Load YOLO model
model = YOLO(MODEL_PATH)

cap = cv2.VideoCapture(VIDEO_PATH)
assert cap.isOpened()

# Track history
track_history = {}

# Counted IDs (only vehicles)
counted_vehicle_ids = set()

vehicle_count = 0

# Vehicle classes only
VEHICLE_CLASSES = [1, 2, 3, 5, 7]  # bicycle, car, motorcycle, bus, truck

while True:

    ret, frame = cap.read()
    if not ret:
        break

    h, w, _ = frame.shape

    # -------- Dynamic counting line --------
    LINE_Y = int(h * 0.58)

    # YOLO tracking
    results = model.track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        conf=0.4,
        verbose=False
    )

    # Draw counting line
    cv2.line(frame, (0, LINE_Y), (w, LINE_Y), (0, 0, 255), LINE_THICKNESS)

    cv2.putText(frame,
                "Counting Line",
                (10, LINE_Y - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 0, 255),
                2)

    if results and results[0].boxes.id is not None:

        boxes = results[0].boxes.xyxy.cpu().numpy()
        ids = results[0].boxes.id.cpu().numpy()
        classes = results[0].boxes.cls.cpu().numpy()

        for box, tid, cls in zip(boxes, ids, classes):

            x1, y1, x2, y2 = map(int, box)
            tid = int(tid)
            cls = int(cls)

            # ❌ Skip non-vehicle
            if cls not in VEHICLE_CLASSES:
                continue

            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            speed_kmh = 0.0

            if tid in track_history:

                px, py = track_history[tid]

                # Speed calculation
                dist_pixels = math.hypot(cx - px, cy - py)
                dist_meters = dist_pixels * PIXEL_TO_METER
                speed_mps = dist_meters * FPS
                speed_kmh = speed_mps * 3.6

                # 🔥 TRUE LINE CROSSING LOGIC
                prev_y = py
                curr_y = cy

                if prev_y < LINE_Y and curr_y >= LINE_Y:
                    if tid not in counted_vehicle_ids:
                        counted_vehicle_ids.add(tid)
                        vehicle_count += 1

                elif prev_y > LINE_Y and curr_y <= LINE_Y:
                    if tid not in counted_vehicle_ids:
                        counted_vehicle_ids.add(tid)
                        vehicle_count += 1

            track_history[tid] = (cx, cy)

            # Draw box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

            # Draw center
            cv2.circle(frame, (cx, cy), 4, (255, 0, 0), -1)

            # Label
            cv2.putText(frame,
                        f"Vehicle ID {tid} | {speed_kmh:.1f} km/h",
                        (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (255, 255, 0),
                        2)

    # Display count
    cv2.putText(frame,
                f"Vehicle Count: {vehicle_count}",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 255, 0),
                3)

    # Resize for display
    display_frame = cv2.resize(frame,
                               (int(w * DISPLAY_SCALE),
                                int(h * DISPLAY_SCALE)))

    cv2.imshow("Vehicle Counting System", display_frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()

print("Total Vehicles:", vehicle_count)