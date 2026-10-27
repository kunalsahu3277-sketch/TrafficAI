import cv2
import numpy as np
from ultralytics import YOLO

# ---------------- CONFIG ----------------
VIDEO_PATH = "MVI_8437.mp4"
MODEL_PATH = "yolov8n.pt"

FRAME_SKIP = 2
RESIZE_WIDTH = 640

PERSON_CLASS = 0
VEHICLE_CLASSES = [2, 3, 5, 7]

MAX_TRACK_LENGTH = 20

# ---------------------------------------

model = YOLO(MODEL_PATH)
cap = cv2.VideoCapture(VIDEO_PATH)

ped_tracks = {}
veh_tracks = {}

frame_count = 0

# ---------------- HELPERS ----------------

def get_center(box):
    x1, y1, x2, y2 = box
    return int((x1 + x2) / 2), int((y1 + y2) / 2)


def intersect(p1, p2, p3, p4):
    """ Accurate line segment intersection """

    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4

    denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4)

    if denom == 0:
        return None  # parallel

    px = ((x1*y2 - y1*x2)*(x3-x4) - (x1-x2)*(x3*y4 - y3*x4)) / denom
    py = ((x1*y2 - y1*x2)*(y3-y4) - (y1-y2)*(x3*y4 - y3*x4)) / denom

    # check if inside both segments
    if (min(x1,x2)-1 <= px <= max(x1,x2)+1 and
        min(y1,y2)-1 <= py <= max(y1,y2)+1 and
        min(x3,x4)-1 <= px <= max(x3,x4)+1 and
        min(y3,y4)-1 <= py <= max(y3,y4)+1):
        
        return int(px), int(py)

    return None


# ---------------- MAIN LOOP ----------------

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1
    if frame_count % FRAME_SKIP != 0:
        continue

    # resize for speed
    h, w = frame.shape[:2]
    scale = RESIZE_WIDTH / w
    frame = cv2.resize(frame, (RESIZE_WIDTH, int(h * scale)))

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

    # -------- DRAW TRAJECTORIES --------
    for track in ped_tracks.values():
        for i in range(1, len(track)):
            cv2.line(overlay, track[i-1], track[i], (200, 200, 255), 1)

    for track in veh_tracks.values():
        for i in range(1, len(track)):
            cv2.line(overlay, track[i-1], track[i], (180, 180, 180), 1)

    # -------- INTERSECTION DETECTION --------
    points = []

    for p in ped_tracks.values():
        for v in veh_tracks.values():
            for i in range(1, len(p)):
                for j in range(1, len(v)):
                    pt = intersect(p[i-1], p[i], v[j-1], v[j])
                    if pt:
                        points.append(pt)

    # remove duplicates (clean clustering)
    clean_pts = []
    for pt in points:
        if all(np.linalg.norm(np.array(pt) - np.array(c)) > 12 for c in clean_pts):
            clean_pts.append(pt)

    # -------- DRAW COLLISION POINTS (BLACK SHARP) --------
    for pt in clean_pts:
        cv2.circle(overlay, pt, 2, (0, 0, 0), -1)

    # blend overlay
    output = cv2.addWeighted(overlay, 0.85, frame, 0.15, 0)

    cv2.imshow("Final Clean Output", output)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()