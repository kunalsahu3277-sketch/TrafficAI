import pandas as pd
from sklearn.svm import SVC
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# Load CSV
data = pd.read_csv("runs/detect/train/results.csv").fillna(0)

# Features
X = data[["metrics/precision(B)", "metrics/recall(B)"]].astype(float)

# Create balanced target using median
threshold = data["metrics/precision(B)"].median()
y = (data["metrics/precision(B)"] > threshold).astype(int)

# Check class distribution
print("Class distribution:\n", y.value_counts())

# Make sure we have at least 2 classes
if len(y.unique()) < 2:
    print("Not enough class variation to train SVM.")
    exit()

# Split data (removed stratify to avoid error)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.3, random_state=42
)

# Feature scaling (important for SVM)
scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)

# Train SVM
svm = SVC(kernel='linear')
svm.fit(X_train, y_train)

# Accuracy
accuracy = svm.score(X_test, y_test)
print("SVM Accuracy:", accuracy)
