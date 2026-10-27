import cv2
import numpy as np
from ultralytics import YOLO
from collections import defaultdict
import math

# ---------------- CONFIG ----------------
VIDEO_PATH = "MVI_8447.mp4"
MODEL_PATH = "yolov8n.pt"

CONF_THRESHOLD = 0.5

PERSON_CLASS = 0
VEHICLE_CLASSES = [2, 3, 5, 7]

DIST_THRESHOLD = 80   # for TTC

# Risk Weights
W1, W2, W3 = 0.4, 0.4, 0.2

# ---------------- LOAD MODEL ----------------
model = YOLO(MODEL_PATH)
cap = cv2.VideoCapture(VIDEO_PATH)

# ---------------- STORAGE ----------------
tracks = defaultdict(list)
velocities = defaultdict(lambda: (0, 0))
segments = []
heatmap = np.zeros((720, 1280), dtype=np.float32)

# ---------------- INTERSECTION ----------------
def intersect(p1, p2, p3, p4):
    def ccw(A,B,C):
        return (C[1]-A[1])*(B[0]-A[0]) > (B[1]-A[1])*(C[0]-A[0])
    return (ccw(p1,p3,p4) != ccw(p2,p3,p4)) and (ccw(p1,p2,p3) != ccw(p1,p2,p4))

# ---------------- MAIN LOOP ----------------
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.resize(frame, (1280, 720))

    results = model.track(frame, persist=True, conf=CONF_THRESHOLD)

    objects = []

    if results[0].boxes.id is not None:
        boxes = results[0].boxes.xyxy.cpu().numpy()
        ids = results[0].boxes.id.cpu().numpy()
        classes = results[0].boxes.cls.cpu().numpy()

        for box, track_id, cls in zip(boxes, ids, classes):

            cls = int(cls)

            if cls == PERSON_CLASS:
                obj_type = "person"
            elif cls in VEHICLE_CLASSES:
                obj_type = "vehicle"
            else:
                continue

            x1, y1, x2, y2 = map(int, box)

            if (x2-x1) < 30 or (y2-y1) < 30:
                continue

            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)

            track_id = int(track_id)
            tracks[track_id].append((cx, cy))

            # -------- VELOCITY --------
            if len(tracks[track_id]) >= 2:
                vx = tracks[track_id][-1][0] - tracks[track_id][-2][0]
                vy = tracks[track_id][-1][1] - tracks[track_id][-2][1]
                velocities[track_id] = (vx, vy)

            objects.append((track_id, cx, cy, obj_type))

            # -------- TRAJECTORY --------
            for i in range(1, len(tracks[track_id])):
                cv2.line(frame, tracks[track_id][i-1], tracks[track_id][i], (255,255,255), 2)

            # -------- SEGMENTS --------
            if len(tracks[track_id]) >= 2:
                segments.append((tracks[track_id][-2], tracks[track_id][-1], obj_type))

    # ---------------- HYBRID RISK ----------------
    for i in range(len(objects)):
        for j in range(i+1, len(objects)):

            id1, x1, y1, type1 = objects[i]
            id2, x2, y2, type2 = objects[j]

            if type1 == type2:
                continue

            # -------- DISTANCE --------
            dist = math.sqrt((x1-x2)**2 + (y1-y2)**2)

            # -------- TTC --------
            vx1, vy1 = velocities[id1]
            vx2, vy2 = velocities[id2]

            rel_speed = math.sqrt((vx1-vx2)**2 + (vy1-vy2)**2) + 1e-5
            ttc = dist / rel_speed

            ttc_risk = 1 if ttc < 20 else 0

            # -------- TRAJECTORY INTERSECTION --------
            traj_risk = 0
            for seg in segments:
                if seg[2] != type1:
                    if intersect(seg[0], seg[1], (x1,y1), (x2,y2)):
                        traj_risk = 1
                        break

            # -------- HEATMAP --------
            if dist < DIST_THRESHOLD:
                heatmap[y1, x1] += 1

            heat_val = heatmap[y1, x1] / 50
            heat_risk = min(1, heat_val)

            # -------- FINAL RISK SCORE --------
            risk_score = W1*traj_risk + W2*ttc_risk + W3*heat_risk

            if risk_score > 0.6:
                mx, my = int((x1+x2)/2), int((y1+y2)/2)

                cv2.circle(frame, (mx,my), 8, (0,0,255), -1)
                cv2.putText(frame, "HIGH RISK", (mx, my-10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)

    # ---------------- HEATMAP OVERLAY ----------------
    heat_blur = cv2.GaussianBlur(heatmap, (31,31), 0)
    heat_norm = cv2.normalize(heat_blur, None, 0, 255, cv2.NORM_MINMAX)
    heat_color = cv2.applyColorMap(heat_norm.astype(np.uint8), cv2.COLORMAP_JET)

    overlay = cv2.addWeighted(frame, 0.7, heat_color, 0.3, 0)

    cv2.imshow("Hybrid Accident Prediction", overlay)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()