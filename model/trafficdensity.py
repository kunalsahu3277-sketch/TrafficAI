import cv2
from ultralytics import YOLO

# Load trained model
model = YOLO("yolov8n.pt")

# Video input
cap = cv2.VideoCapture("6666.mp4")

cv2.namedWindow("Traffic Analysis", cv2.WINDOW_NORMAL)

while True:

    ret, frame = cap.read()
    if not ret:
        break

    # YOLO detection
    results = model(frame, conf=0.5)

    vehicle_count = 0

    if results and results[0].boxes is not None:

        boxes = results[0].boxes

        for box in boxes:

            cls_id = int(box.cls[0])
            class_name = model.names[cls_id]

            # vehicle classes
            if class_name in ["car","truck","bus","motorcycle","bicycle"]:

                vehicle_count += 1

                x1,y1,x2,y2 = map(int, box.xyxy[0])

                cv2.rectangle(frame,(x1,y1),(x2,y2),(0,255,0),2)

                cv2.putText(frame,class_name,(x1,y1-10),
                            cv2.FONT_HERSHEY_SIMPLEX,0.5,(0,255,0),2)

    # Traffic density
    frame_area = frame.shape[0] * frame.shape[1]
    density = vehicle_count / frame_area

    # Traffic level classification
    if vehicle_count <= 5:
        traffic_level = "LOW"
        color = (0,255,0)

    elif vehicle_count <= 15:
        traffic_level = "NORMAL"
        color = (0,255,255)

    else:
        traffic_level = "HIGH"
        color = (0,0,255)

    # Show results
    cv2.putText(frame,f"Vehicle Count: {vehicle_count}",(20,40),
                cv2.FONT_HERSHEY_SIMPLEX,1,(255,0,0),2)

    cv2.putText(frame,f"Density: {density:.6f}",(20,80),
                cv2.FONT_HERSHEY_SIMPLEX,1,(255,0,255),2)

    cv2.putText(frame,f"Traffic Level: {traffic_level}",(20,120),
                cv2.FONT_HERSHEY_SIMPLEX,1,color,2)

    # Fix zoom issue
    display = cv2.resize(frame,(960,540))

    cv2.imshow("Traffic Analysis",display)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()