import cv2
from ultralytics import YOLO

# Load model
model = YOLO("yolov8n.pt")

cap = cv2.VideoCapture("traffic1.mp4")

vehicle_count = 0
pedestrian_count = 0

counted_ids = set()

vehicle_classes = ["car","bus","truck","motorcycle"]

line1_y = 1500
line2_y = 1450
offset = 10

# create resizable window
cv2.namedWindow("Traffic Monitoring", cv2.WINDOW_NORMAL)
cv2.resizeWindow("Traffic Monitoring", 1000, 600)

while True:

    ret, frame = cap.read()
    if not ret:
        break

    height, width, _ = frame.shape

    results = model.track(frame, persist=True, tracker="bytetrack.yaml")

    if results[0].boxes.id is not None:

        boxes = results[0].boxes.xyxy.cpu().numpy()
        classes = results[0].boxes.cls.cpu().numpy()
        ids = results[0].boxes.id.cpu().numpy()

        for box, cls, obj_id in zip(boxes, classes, ids):

            x1,y1,x2,y2 = map(int, box)

            cx = int((x1+x2)/2)
            cy = int((y1+y2)/2)

            label = model.names[int(cls)]

            cv2.rectangle(frame,(x1,y1),(x2,y2),(0,255,0),2)
            cv2.circle(frame,(cx,cy),4,(0,0,255),-1)

            cv2.putText(frame,f"{label} ID:{int(obj_id)}",
                        (x1,y1-10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (255,255,0),
                        2)

            if obj_id not in counted_ids:

                if line1_y-offset < cy < line1_y+offset or line2_y-offset < cy < line2_y+offset:

                    if label in vehicle_classes:
                        vehicle_count += 1
                        counted_ids.add(obj_id)

                    elif label == "person":
                        pedestrian_count += 1
                        counted_ids.add(obj_id)

    # Draw counting lines
    cv2.line(frame,(0,line1_y),(width,line1_y),(255,0,0),3)
    cv2.line(frame,(0,line2_y),(width,line2_y),(0,0,255),3)

    cv2.putText(frame,f"Vehicles: {vehicle_count}",
                (20,40),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0,255,0),
                3)

    cv2.putText(frame,f"Pedestrians: {pedestrian_count}",
                (20,80),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (255,0,255),
                3)

    # resize only for display
    display_frame = cv2.resize(frame,(1000,600))

    cv2.imshow("Traffic Monitoring", display_frame)

    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()