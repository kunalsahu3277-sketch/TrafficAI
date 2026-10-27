import pandas as pd
from sklearn.neighbors import KNeighborsClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# Load data
data = pd.read_csv("runs/detect/train/results.csv").fillna(0)

# Features
X = data[["metrics/precision(B)", "metrics/recall(B)"]]

# Create binary labels (IMPORTANT FIX)
y = (data["metrics/recall(B)"] >= 0.7).astype(int)

# Train-test split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.3, random_state=42, stratify=y
)

# Feature scaling (VERY IMPORTANT for KNN)
scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)

# KNN model
knn = KNeighborsClassifier(n_neighbors=3)
knn.fit(X_train, y_train)

print("KNN Accuracy:", knn.score(X_test, y_test))