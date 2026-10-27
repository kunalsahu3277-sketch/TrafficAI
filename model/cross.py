import cv2
import numpy as np
from ultralytics import YOLO

# ---------------- CONFIG ----------------
VIDEO_PATH = "MVI_8447.mp4"
MODEL_PATH = "yolov8n.pt"

FRAME_SKIP = 2            # speed up (skip frames)
RESIZE_WIDTH = 640        # reduce resolution

PERSON_CLASS = 0
VEHICLE_CLASSES = [2, 3, 5, 7]

MAX_TRACK_LENGTH = 20     # short clean trails

# ---------------------------------------

model = YOLO(MODEL_PATH)
cap = cv2.VideoCapture(VIDEO_PATH)

ped_tracks = {}
veh_tracks = {}

frame_count = 0

# ---------------- HELPERS ----------------

def get_center(box):
    x1, y1, x2, y2 = box
    return int((x1+x2)/2), int((y1+y2)/2)


def intersect(p1, p2, p3, p4):
    def ccw(A, B, C):
        return (C[1]-A[1])*(B[0]-A[0]) > (B[1]-A[1])*(C[0]-A[0])

    if (ccw(p1,p3,p4) != ccw(p2,p3,p4)) and (ccw(p1,p2,p3) != ccw(p1,p2,p4)):
        return ((p2[0]+p3[0])//2, (p2[1]+p3[1])//2)
    return None


# ---------------- LOOP ----------------

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1
    if frame_count % FRAME_SKIP != 0:
        continue   # skip frames for speed

    # resize for performance
    h, w = frame.shape[:2]
    scale = RESIZE_WIDTH / w
    frame = cv2.resize(frame, (RESIZE_WIDTH, int(h*scale)))

    overlay = frame.copy()

    results = model(frame, verbose=False)[0]

    ped_pts, veh_pts = [], []

    for box, cls in zip(results.boxes.xyxy, results.boxes.cls):
        cls = int(cls)
        box = box.cpu().numpy()

        cx, cy = get_center(box)

        if cls == PERSON_CLASS:
            ped_pts.append((cx, cy))

        elif cls in VEHICLE_CLASSES:
            veh_pts.append((cx, cy))

    # update tracks
    for i, pt in enumerate(ped_pts):
        ped_tracks.setdefault(i, []).append(pt)
        if len(ped_tracks[i]) > MAX_TRACK_LENGTH:
            ped_tracks[i].pop(0)

    for i, pt in enumerate(veh_pts):
        veh_tracks.setdefault(i, []).append(pt)
        if len(veh_tracks[i]) > MAX_TRACK_LENGTH:
            veh_tracks[i].pop(0)

    # -------- DRAW (THIN + LIGHT) --------
    for track in ped_tracks.values():
        for i in range(1, len(track)):
            cv2.line(overlay, track[i-1], track[i], (200, 200, 255), 1)

    for track in veh_tracks.values():
        for i in range(1, len(track)):
            cv2.line(overlay, track[i-1], track[i], (180, 180, 180), 1)

    # -------- INTERSECTION --------
    points = []

    for p in ped_tracks.values():
        for v in veh_tracks.values():
            for i in range(1, len(p)):
                for j in range(1, len(v)):
                    pt = intersect(p[i-1], p[i], v[j-1], v[j])
                    if pt:
                        points.append(pt)

    # clean duplicates
    clean_pts = []
    for pt in points:
        if all(np.linalg.norm(np.array(pt)-np.array(c)) > 15 for c in clean_pts):
            clean_pts.append(pt)

    # draw intersections (small & clean)
    for pt in clean_pts:
        cv2.circle(overlay, pt, 5, (0, 100, 255), -1)

    # blend
    output = cv2.addWeighted(overlay, 0.8, frame, 0.2, 0)

    cv2.imshow("Smooth & Clean Output", output)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()