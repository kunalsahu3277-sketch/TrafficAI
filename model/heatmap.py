import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

file_path = r"runs\detect\train\results.csv"

df = pd.read_csv(file_path)

# Extract metrics
precision = df["metrics/precision(B)"]
recall = df["metrics/recall(B)"]   # Sensitivity

# Approximate Accuracy (for visualization purpose)
accuracy = (precision + recall) / 2

# Create new matrix
metrics_data = np.column_stack((precision, recall, accuracy))

plt.figure(figsize=(10, 8))
im = plt.imshow(metrics_data, aspect='auto')

plt.xticks(
    ticks=np.arange(3),
    labels=["Precision", "Sensitivity", "Accuracy"],
    rotation=30
)

num_epochs = metrics_data.shape[0]
step = max(1, num_epochs // 10)

plt.yticks(
    ticks=np.arange(0, num_epochs, step),
    labels=np.arange(0, num_epochs, step)
)

plt.xlabel("Metrics")
plt.ylabel("Epoch")
plt.title("YOLOv8 Vehicle Detection Training Heatmap")

plt.colorbar(im, fraction=0.046, pad=0.04)
plt.tight_layout()
plt.show()