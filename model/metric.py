import pandas as pd

df = pd.read_csv("runs/detect/train/results.csv")

precision = df["metrics/precision(B)"].iloc[-1]
recall = df["metrics/recall(B)"].iloc[-1]

# Assume total positives = total negatives = 1
P = 1
N = 1

TP = recall * P
FN = P - TP
FP = TP * (1 - precision) / precision if precision != 0 else 0
TN = N - FP

accuracy = (TP + TN) / (P + N)
sensitivity = TP / (TP + FN)
specificity = TN / (TN + FP)

print(f"Precision    : {precision:.4f}")
print(f"Recall       : {recall:.4f}")
print(f"Accuracy     : {accuracy:.4f}")
print(f"Sensitivity  : {sensitivity:.4f}")
print(f"Specificity  : {specificity:.4f}")