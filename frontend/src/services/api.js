// API Service - Connects to FastAPI backend
const API_BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '';

export async function checkHealth() {
  const start = performance.now();
  const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3500) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const latency = Math.round(performance.now() - start);
  return { ...data, latencyMs: latency };
}

export async function predictImage(file, conf = 0.25) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/predict?conf=${conf}`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Server error ${res.status}`);
  }
  return res.json();
}

export async function analyzeVideo(file, conf = 0.25, iou = 0.45) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('conf', conf);
  formData.append('iou', iou);
  const res = await fetch(`${API_BASE}/api/video/analyze`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Server error ${res.status}`);
  }
  return res.json();
}

export async function getJobStatus(jobId) {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Failed to get job status`);
  return res.json();
}

export async function getJobResults(jobId) {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/results`);
  if (!res.ok) throw new Error(`Results not available`);
  return res.json();
}

export function getJobVideoUrl(jobId) {
  return `${API_BASE}/api/jobs/${jobId}/video?t=${Date.now()}`;
}

export async function fetchSampleImage() {
  const res = await fetch(`${API_BASE}/sample-image`);
  if (!res.ok) throw new Error('Sample image not available');
  const blob = await res.blob();
  return new File([blob], 'traffic_sample.jpg', { type: 'image/jpeg' });
}

export async function fetchSampleVideo() {
  const res = await fetch(`${API_BASE}/sample-video`);
  if (!res.ok) throw new Error('Sample video not available');
  const blob = await res.blob();
  return new File([blob], 'traffic_sample.mp4', { type: 'video/mp4' });
}

export async function getModels() {
  const res = await fetch(`${API_BASE}/api/models`);
  if (!res.ok) throw new Error(`Failed to get models`);
  return res.json();
}
