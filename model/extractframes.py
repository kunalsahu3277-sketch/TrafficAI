import cv2
import os

# -------- SETTINGS --------
video_path = "traffic3.mp4"   # your video file
output_dir = "frames"        # folder to save frames
resize_width = 640
resize_height = 640
show_preview = True          # set False if you don't want preview
# --------------------------

os.makedirs(output_dir, exist_ok=True)

cap = cv2.VideoCapture(video_path)

if not cap.isOpened():
    print("❌ Could not open video")
    exit()

count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # 🔹 Resize frame (YOLO-friendly)
    frame = cv2.resize(frame, (resize_width, resize_height))

    # 🔹 Optional preview
    if show_preview:
        cv2.imshow("Frame", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    # 🔹 Save frame
    cv2.imwrite(f"{output_dir}/frame_{count:05d}.jpg", frame)
    count += 1

cap.release()
cv2.destroyAllWindows()

print(f"✅ Extracted {count} frames into '{output_dir}' folder")