import cv2
import time
from ultralytics import YOLO

# Load trained model
model = YOLO("yolov8n.pt")

cap = cv2.VideoCapture("traffic1.mp4")

cv2.namedWindow("Traffic Analysis", cv2.WINDOW_NORMAL)

# two counting lines
line1_y = 1350
line2_y = 1450

# store crossing times
cross_times = []
counted_ids = set()

prev_vehicle_time = None

while True:

    ret, frame = cap.read()
    if not ret:
        break

    results = model.track(frame, persist=True, conf=0.5)

    # draw lines
    cv2.line(frame,(0,line1_y),(frame.shape[1],line1_y),(0,255,255),3)
    cv2.line(frame,(0,line2_y),(frame.shape[1],line2_y),(255,0,0),3)

    for r in results:

        boxes = r.boxes

        for box in boxes:

            cls_id = int(box.cls[0])
            class_name = model.names[cls_id]

            x1,y1,x2,y2 = map(int, box.xyxy[0])

            track_id = int(box.id[0]) if box.id is not None else None

            center_y = (y1+y2)//2

            # vehicle crosses line1
            if track_id not in counted_ids and center_y > line1_y:

                counted_ids.add(track_id)

                current_time = time.time()
                cross_times.append(current_time)

                # calculate headway
                if prev_vehicle_time is not None:
                    headway = current_time - prev_vehicle_time
                    print(f"Time Headway: {headway:.2f} seconds")

                prev_vehicle_time = current_time

            # draw bounding box
            cv2.rectangle(frame,(x1,y1),(x2,y2),(0,255,0),2)

            cv2.putText(frame,f"ID:{track_id}",
                        (x1,y1-10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,(0,255,0),2)

    # resize frame to avoid zoom
    display = cv2.resize(frame,(1000,600))

    cv2.imshow("Traffic Analysis",display)

    if cv2.waitKey(1)==27:
        break

cap.release()
cv2.destroyAllWindows()
