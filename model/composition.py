import cv2
from ultralytics import YOLO

# load trained model
model = YOLO("yolov8n.pt")  # better than n

cap = cv2.VideoCapture("6666.mp4")

line_y = 640

vehicle_counts = {
    "car":0,
    "truck":0,
    "bus":0,
    "motorcycle":0,
    "bicycle":0
}

# 🔥 NEW: ID storage
vehicle_ids = {
    "car": set(),
    "truck": set(),
    "bus": set(),
    "motorcycle": set(),
    "bicycle": set()
}

counted_ids = set()

cv2.namedWindow("Traffic Analysis", cv2.WINDOW_NORMAL)

while True:

    ret, frame = cap.read()
    if not ret:
        break

    results = model.track(frame, persist=True, conf=0.5)

    cv2.line(frame,(0,line_y),(frame.shape[1],line_y),(0,0,255),3)

    if results[0].boxes is not None:

        boxes = results[0].boxes

        for box in boxes:

            cls_id = int(box.cls[0])
            class_name = model.names.get(cls_id, "unknown")

            if class_name not in vehicle_counts:
                continue

            # 🔥 SAFE ID CHECK
            if box.id is None:
                continue

            track_id = int(box.id[0])

            x1,y1,x2,y2 = map(int, box.xyxy[0])
            center_y = (y1+y2)//2

            # -------- COUNT + STORE ID --------
            if track_id not in counted_ids and center_y > line_y:
                counted_ids.add(track_id)
                vehicle_counts[class_name] += 1
                vehicle_ids[class_name].add(track_id)

            # draw box
            cv2.rectangle(frame,(x1,y1),(x2,y2),(0,255,0),2)

            cv2.putText(frame,f"{class_name} ID:{track_id}",
                        (x1,y1-10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,(0,255,0),2)

    total = sum(vehicle_counts.values())

    cv2.putText(frame,f"Total Vehicles: {total}",(20,40),
                cv2.FONT_HERSHEY_SIMPLEX,1,(0,0,255),2)

    display = cv2.resize(frame,(1000,600))
    cv2.imshow("Traffic Analysis",display)

    if cv2.waitKey(1)==27:
        break

cap.release()
cv2.destroyAllWindows()

# -------- FINAL OUTPUT --------
print("\n🚗 Vehicle Composition with IDs\n")

total = sum(vehicle_counts.values())

for v in vehicle_counts:

    count = vehicle_counts[v]
    percent = (count/total)*100 if total>0 else 0
    ids_list = list(vehicle_ids[v])

    print(f"\n🔹 {v.upper()} GROUP")
    print(f"Count: {count}")
    print(f"Percentage: {percent:.2f}%")
    print(f"IDs: {ids_list}")
    print("-"*40)