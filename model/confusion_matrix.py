import pandas as pd
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import confusion_matrix

# Load YOLO training results
df = pd.read_csv("runs/detect/train/results.csv").fillna(0)

# Features
X = df[["metrics/precision(B)", "metrics/recall(B)"]]

# Binary labels (Good vs Bad detection)
y = ((df["metrics/precision(B)"] >= 0.85) &
     (df["metrics/recall(B)"] >= 0.65)).astype(int)

# Show class distribution
print("Class distribution:")
print(y.value_counts())

# Train-test split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.3, random_state=42, stratify=y
)

# KNN classifier
knn = KNeighborsClassifier(n_neighbors=3)
knn.fit(X_train, y_train)

# Predictions
y_pred = knn.predict(X_test)

# Confusion matrix (force 2x2)
cm = confusion_matrix(y_test, y_pred, labels=[0,1])

print("Confusion Matrix:")
print(cm)

# Plot confusion matrix
plt.figure(figsize=(5,4))
plt.imshow(cm, cmap="Blues")
plt.title("Confusion Matrix")
plt.colorbar()

labels = ["Bad", "Good"]
plt.xticks(range(len(labels)), labels)
plt.yticks(range(len(labels)), labels)

# Dynamic loop based on matrix shape
for i in range(cm.shape[0]):
    for j in range(cm.shape[1]):
        plt.text(j, i, cm[i, j],
                 ha="center",
                 va="center",
                 color="white" if cm[i, j] > cm.max()/2 else "black")

plt.xlabel("Predicted Label")
plt.ylabel("True Label")
plt.tight_layout()
plt.show()