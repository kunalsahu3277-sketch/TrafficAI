import cv2
from ultralytics import YOLO

# ---------------- CONFIG ----------------
model = YOLO("yolov8n.pt")
cap = cv2.VideoCapture("MVI_8437.mp4")

# -------- COUNTING LINES --------
LINE_Y = 600  # horizontal line
LINE_X = 900  # vertical line
OFFSET = 10

# vehicle types
vehicle_counts = {
    "car":0,
    "truck":0,
    "bus":0,
    "motorcycle":0,
    "bicycle":0
}

# avoid double counting
counted_ids = set()

cv2.namedWindow("Traffic Analysis", cv2.WINDOW_NORMAL)

# ---------------- LOOP ----------------
while True:

    ret, frame = cap.read()
    if not ret:
        break

    results = model.track(frame, persist=True, conf=0.5, tracker="bytetrack.yaml")

    # draw lines
    cv2.line(frame,(0,LINE_Y),(frame.shape[1],LINE_Y),(0,0,255),3)
    cv2.line(frame,(LINE_X,0),(LINE_X,frame.shape[0]),(255,0,255),3)

    for r in results:

        boxes = r.boxes

        if boxes.id is None:
            continue

        for box in boxes:

            cls_id = int(box.cls[0])
            class_name = model.names[cls_id]

            if class_name not in vehicle_counts:
                continue

            x1,y1,x2,y2 = map(int, box.xyxy[0])
            track_id = int(box.id[0])

            cx = (x1+x2)//2
            cy = (y1+y2)//2

            # -------- CROSSING LOGIC --------
            crossed = False

            # Horizontal crossing
            if abs(cy - LINE_Y) < OFFSET:
                crossed = True

            # Vertical crossing
            if abs(cx - LINE_X) < OFFSET:
                crossed = True

            # count only once
            if crossed and track_id not in counted_ids:
                counted_ids.add(track_id)
                vehicle_counts[class_name] += 1

            # draw box
            cv2.rectangle(frame,(x1,y1),(x2,y2),(0,255,0),2)
            cv2.circle(frame,(cx,cy),4,(0,255,255),-1)

            cv2.putText(frame,f"{class_name} ID:{track_id}",
                        (x1,y1-10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,(0,255,0),2)

    # -------- DISPLAY --------
    total = sum(vehicle_counts.values())

    cv2.putText(frame,f"Total Vehicles: {total}",(20,40),
                cv2.FONT_HERSHEY_SIMPLEX,1,(0,0,255),2)

    display = cv2.resize(frame,(1000,600))
    cv2.imshow("Traffic Analysis",display)

    if cv2.waitKey(1)==27:
        break

cap.release()
cv2.destroyAllWindows()

# -------- FINAL COMPOSITION --------
print("\n===== VEHICLE COMPOSITION =====\n")

total = sum(vehicle_counts.values())

for v,c in vehicle_counts.items():
    percent = (c/total)*100 if total>0 else 0
    print(f"{v} : {c} ({percent:.2f}%)")

print(f"\nTotal Vehicles Counted: {total}")