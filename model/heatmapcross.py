import cv2
import numpy as np
from ultralytics import YOLO
from collections import defaultdict

# ---------------- CONFIG ----------------
VIDEO_PATH = "1111.mp4"
MODEL_PATH = "yolov8n.pt"

CONF_THRESHOLD = 0.5

PERSON_CLASS = 0
VEHICLE_CLASSES = [2, 3, 5, 7]

# ---------------- LOAD MODEL ----------------
model = YOLO(MODEL_PATH)
cap = cv2.VideoCapture(VIDEO_PATH)

# ---------------- STORAGE ----------------
tracks = defaultdict(list)
segments = []   # (p1, p2, type)

# ---------------- HEATMAP ----------------
heatmap = np.zeros((720, 1280), dtype=np.float32)

# ---------------- INTERSECTION ----------------
def intersect(p1, p2, p3, p4):
    def ccw(A, B, C):
        return (C[1]-A[1])*(B[0]-A[0]) > (B[1]-A[1])*(C[0]-A[0])
    return (ccw(p1,p3,p4) != ccw(p2,p3,p4)) and (ccw(p1,p2,p3) != ccw(p1,p2,p4))

# ---------------- MAIN LOOP ----------------
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.resize(frame, (1280, 720))

    results = model.track(frame, persist=True, conf=CONF_THRESHOLD)

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

            pts = tracks[track_id]

            # -------- CREATE SEGMENT --------
            if len(pts) >= 2:
                new_seg = (pts[-2], pts[-1], obj_type)

                # -------- CHECK VEHICLE vs PERSON --------
                for old_seg in segments:

                    if new_seg[2] == old_seg[2]:
                        continue

                    if intersect(new_seg[0], new_seg[1], old_seg[0], old_seg[1]):

                        ix = int((new_seg[1][0] + old_seg[1][0]) / 2)
                        iy = int((new_seg[1][1] + old_seg[1][1]) / 2)

                        # -------- ADD TO HEATMAP --------
                        if 0 <= ix < 1280 and 0 <= iy < 720:
                            heatmap[iy, ix] += 1

                segments.append(new_seg)

    # ---------------- HEATMAP PROCESS ----------------
    heatmap_blur = cv2.GaussianBlur(heatmap, (31, 31), 0)
    heatmap_norm = cv2.normalize(heatmap_blur, None, 0, 255, cv2.NORM_MINMAX)
    heatmap_color = cv2.applyColorMap(heatmap_norm.astype(np.uint8), cv2.COLORMAP_JET)

    # ---------------- OVERLAY ----------------
    overlay = cv2.addWeighted(frame, 0.6, heatmap_color, 0.4, 0)

    cv2.imshow("Final Heatmap (Vehicle-Pedestrian Conflict)", overlay)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()