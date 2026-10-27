import cv2
from ultralytics import YOLO

# ---------------- CONFIG ----------------
model = YOLO("yolov8n.pt")
cap = cv2.VideoCapture("6666.mp4")

vehicle_counts = {
    "car":0,
    "truck":0,
    "bus":0,
    "motorcycle":0,
    "bicycle":0
}

counted_ids = set()

cv2.namedWindow("Traffic Analysis", cv2.WINDOW_NORMAL)

while True:

    ret, frame = cap.read()
    if not ret:
        break

    # -------- CENTER HORIZONTAL LINE --------
    line_y = frame.shape[0] // 2

    results = model.track(frame, persist=True, conf=0.5)

    # draw line
    cv2.line(frame, (0, line_y), (frame.shape[1], line_y), (0,0,255), 3)

    cv2.putText(frame, "Counting Line",
                (20, line_y - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7, (0,0,255), 2)

    for r in results:
        for box in r.boxes:

            cls_id = int(box.cls[0])
            class_name = model.names[cls_id]

            if class_name in vehicle_counts:

                x1,y1,x2,y2 = map(int, box.xyxy[0])

                track_id = int(box.id[0]) if box.id is not None else None
                if track_id is None:
                    continue

                center_y = (y1 + y2) // 2

                # -------- SIMPLE LINE CROSSING --------
                if abs(center_y - line_y) < 8:

                    if track_id not in counted_ids:
                        counted_ids.add(track_id)
                        vehicle_counts[class_name] += 1

                # draw box
                cv2.rectangle(frame,(x1,y1),(x2,y2),(0,255,0),2)

                cv2.putText(frame,f"{class_name} ID:{track_id}",
                            (x1,y1-10),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.5,(0,255,0),2)

    # -------- STATS --------
    total = sum(vehicle_counts.values())

    cv2.putText(frame,f"Total Vehicles: {total}",(20,40),
                cv2.FONT_HERSHEY_SIMPLEX,1,(0,0,255),2)

    display = cv2.resize(frame,(1000,600))
    cv2.imshow("Traffic Analysis", display)

    if cv2.waitKey(1)==27:
        break

cap.release()
cv2.destroyAllWindows()

# -------- VEHICLE COMPOSITION --------
print("\nVehicle Composition\n")

total = sum(vehicle_counts.values())

for v,c in vehicle_counts.items():
    percent = (c/total)*100 if total>0 else 0
    print(f"{v} : {c} ({percent:.2f}%)")