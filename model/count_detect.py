import cv2
from ultralytics import YOLO

# ------------ CONFIG --------------
VIDEO_PATH = "6666.mp4"            # Your video file
MODEL_PATH = "runs/detect/train/weights/best.pt"  # Your YOLO weights

DISPLAY_SCALE = 0.5
LINE_THICKNESS = 2
CONFIDENCE_THRESHOLD = 0.4

# COCO class IDs for pedestrians and vehicles
PERSON_CLASS = 0
VEHICLE_CLASSES = [1, 2, 3, 5, 7]  # bicycle, car, motorcycle, bus, truck

# Lines positions (percentage of frame height)
LINE1_Y_RATIO = 0.60
LINE2_Y_RATIO = 0.62
# ---------------------------------

# Load YOLO model
model = YOLO(MODEL_PATH)

cap = cv2.VideoCapture(VIDEO_PATH)
assert cap.isOpened()

# Tracking previous center Y for each ID
previous_centers = {}

# Counting sets to prevent double count
counted_pedestrians = set()
counted_vehicles = set()

pedestrian_count = 0
vehicle_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    h, w, _ = frame.shape

    LINE1_Y = int(h * LINE1_Y_RATIO)
    LINE2_Y = int(h * LINE2_Y_RATIO)

    # Draw counting lines
    cv2.line(frame, (0, LINE1_Y), (w, LINE1_Y), (255, 0, 0), LINE_THICKNESS)
    cv2.putText(frame, "Line 1", (10, LINE1_Y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)

    cv2.line(frame, (0, LINE2_Y), (w, LINE2_Y), (0, 0, 255), LINE_THICKNESS)
    cv2.putText(frame, "Line 2", (10, LINE2_Y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

    # Perform detection + tracking
    results = model.track(frame, persist=True, tracker="bytetrack.yaml", conf=CONFIDENCE_THRESHOLD, verbose=False)

    if results and results[0].boxes.id is not None:
        boxes = results[0].boxes.xyxy.cpu().numpy()
        ids = results[0].boxes.id.cpu().numpy()
        classes = results[0].boxes.cls.cpu().numpy()

        for box, obj_id, cls in zip(boxes, ids, classes):
            x1, y1, x2, y2 = map(int, box)
            obj_id = int(obj_id)
            cls = int(cls)

            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            # Draw bounding boxes with color based on class
            if cls == PERSON_CLASS:
                color = (255, 0, 255)  # Magenta for pedestrian
                label = "Pedestrian"
            elif cls in VEHICLE_CLASSES:
                color = (0, 255, 0)  # Green for vehicle
                label = "Vehicle"
            else:
                continue  # Skip other classes

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.circle(frame, (cx, cy), 4, (255, 255, 0), -1)
            cv2.putText(frame, f"{label} ID {obj_id}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

            # Check if this ID was seen before
            if obj_id in previous_centers:
                prev_cx, prev_cy = previous_centers[obj_id]

                # Check if crossed from Line 1 to Line 2 (downward)
                if prev_cy < LINE1_Y <= cy < LINE2_Y:
                    if cls == PERSON_CLASS and obj_id not in counted_pedestrians:
                        counted_pedestrians.add(obj_id)
                        pedestrian_count += 1
                    elif cls in VEHICLE_CLASSES and obj_id not in counted_vehicles:
                        counted_vehicles.add(obj_id)
                        vehicle_count += 1

                # Check if crossed from Line 2 to Line 1 (upward)
                elif prev_cy > LINE2_Y >= cy > LINE1_Y:
                    if cls == PERSON_CLASS and obj_id not in counted_pedestrians:
                        counted_pedestrians.add(obj_id)
                        pedestrian_count += 1
                    elif cls in VEHICLE_CLASSES and obj_id not in counted_vehicles:
                        counted_vehicles.add(obj_id)
                        vehicle_count += 1

            # Update last center point
            previous_centers[obj_id] = (cx, cy)

    # Display counts
    cv2.putText(frame, f"Vehicle Count: {vehicle_count}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 3)
    cv2.putText(frame, f"Pedestrian Count: {pedestrian_count}", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 255), 3)

    # Resize for display
    display_frame = cv2.resize(frame, (int(w * DISPLAY_SCALE), int(h * DISPLAY_SCALE)))

    cv2.imshow("Traffic Monitoring System", display_frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()

print(f"Total Vehicles: {vehicle_count}")
print(f"Total Pedestrians: {pedestrian_count}")