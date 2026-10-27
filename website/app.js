/**
 * Traffic AI – Modern Intelligent Traffic Analytics & YOLOv8 Engine
 */

// Application State
const STATE = {
  currentTab: 'dash',
  apiBase: window.location.protocol.startsWith('http') ? window.location.origin : 'http://127.0.0.1:8000',
  model: {
    status: 'checking',
    engine: 'YOLOv8',
    modelFile: 'best.pt',
    classes: ['Bike', 'Car', 'Person', 'Truck'],
    lastPing: null,
    latencyMs: null
  },
  ai: {
    kind: '', // 'image' or 'video'
    file: null,
    fileUrl: '',
    annotatedVideoUrl: '',
    videoViewMode: 'annotated', // 'annotated' or 'original'
    sourceImg: null,
    confidence: 25,
    running: false,
    analyzed: false,
    error: '',
    detections: [],
    videoResult: null,
    lastInferenceTime: null
  },
  files: {
    image: 'None selected',
    video: 'None selected',
    excel: 'counts_peak_hour.xlsx',
    cad: 'junction_geometry_rev3.dwg'
  },
  params: {
    win: 60,
    mpp: 0.05,
    limit: 30,
    basis: 'avg',
    spdAvg: 31.8,
    spdMax: 42.0,
    tvAvg: 406,
    tvMax: 480,
    pvAvg: 214,
    pvMax: 260,
    ttc: 2.9,
    wtPed: 18.6,
    wtVeh: 24.3,
    ttcN: 0.3,
    wtN: 0.3,
    pedCount: 1284,
    pedAvgV: 1.24,
    pedMaxV: 2.06,
    vehCount: 2436,
    queue: 18.4,
    conflicts: 37,
    weights: { ttc: 0.5028, vs: 0.2562, tv: 0.1394, pv: 0.0670, wt: 0.0348 },
    thresholds: { cri: 4000, pri: 1500, pei: 100000, ttc: 3.0, tv1: 150, tv2: 300, tv3: 450, pv1: 100, pv2: 200, pv3: 300 }
  },
  composition: [
    { name: 'Cars', color: '#3b82f6', percent: 45 },
    { name: 'Bikes / 2W', color: '#06b6d4', percent: 32 },
    { name: 'Trucks', color: '#8b5cf6', percent: 14 },
    { name: 'Buses', color: '#f59e0b', percent: 6 },
    { name: 'Other', color: '#64748b', percent: 3 }
  ],
  heatmap: [
    0.15, 0.35, 0.55, 0.30, 0.10,
    0.20, 0.45, 0.85, 0.65, 0.25,
    0.30, 0.65, 0.95, 0.55, 0.30,
    0.25, 0.50, 0.70, 0.40, 0.20,
    0.10, 0.25, 0.35, 0.20, 0.10
  ],
  deficiencies: [
    { title: "Faded or missing pavement markings", desc: "Inspect and renew stop lines, lane separators, and zebra crossings." },
    { title: "Missing or obscured regulatory signs", desc: "Verify speed limit signs, stop signs, and pedestrian warning signs." },
    { title: "Obstructed pedestrian desire line", desc: "Remove barriers, utility posts, or informal parking on walkways." },
    { title: "Deficient sight distance at approach", desc: "Check vegetation, parked heavy vehicles, and sight triangles." },
    { title: "Excessive vehicular approach speeds", desc: "Speeds consistently 25%+ above posted intersection limit." },
    { title: "Inadequate crossing facility / refuge", desc: "Roadway width > 12m without pedestrian refuge island." },
    { title: "Excessive pedestrian delay (> 30s)", desc: "Long cycle times causing unsafe mid-block crossing attempts." },
    { title: "High turning conflict density", desc: "Free-left turns conflicting with green pedestrian phase." }
  ],
  observed: {}
};

// Utilities
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Safety Calculations
function calculateIndices() {
  const S = STATE.params;
  const v = S.basis === 'max' ? S.spdMax : S.spdAvg;
  const issues = [];

  if (!(S.ttc >= 0.1)) issues.push('TTC must be >= 0.1s');
  if (S.limit <= 0 || S.spdAvg <= 0 || S.tvAvg <= 0 || S.pvAvg <= 0) issues.push('Core parameters must exceed 0');
  if (S.spdMax < S.spdAvg || S.tvMax < S.tvAvg || S.pvMax < S.pvAvg) issues.push('Max values cannot be less than averages');

  if (issues.length) {
    return { ok: false, message: issues.join('; ') };
  }

  const VSn = S.spdMax / S.spdAvg;
  const TVn = S.tvMax / S.tvAvg;
  const PVn = S.pvMax / S.pvAvg;
  const w = S.weights;

  const rawPSI = 100 * (w.ttc * S.ttcN + w.vs * VSn + w.tv * TVn + w.pv * PVn + w.wt * S.wtN);
  const PSI = Math.min(100, Math.max(0, rawPSI));
  const SRI = v / S.limit;
  const CRI = (v * S.tvAvg) / S.ttc;
  const PRI = (S.pvAvg * S.wtPed) / S.ttc;
  const PEI = S.pvAvg * S.tvAvg;

  return {
    ok: true,
    VSn, TVn, PVn,
    rawPSI, PSI,
    SRI, CRI, PRI, PEI
  };
}

function classifyIndices() {
  const res = calculateIndices();
  if (!res.ok) return null;

  const p = Math.round(res.PSI);
  let psiBand = { label: 'Low concern', color: 'emerald', badge: 'badge-emerald', rec: 'Routine monitoring; maintain markings and signage.' };
  if (p > 80) psiBand = { label: 'Critical concern', color: 'rose', badge: 'badge-rose', rec: 'Detailed safety assessment & geometric intervention required.' };
  else if (p > 60) psiBand = { label: 'High concern', color: 'amber', badge: 'badge-amber', rec: 'Prioritise pedestrian safety; evaluate traffic calming & crossing refuge.' };
  else if (p > 30) psiBand = { label: 'Moderate concern', color: 'cyan', badge: 'badge-cyan', rec: 'Inspect crossing visibility, sightlines and approach speeds.' };

  const sriHigh = res.SRI > 1.0;
  const criHigh = res.CRI >= STATE.params.thresholds.cri;
  const priHigh = res.PRI >= STATE.params.thresholds.pri;
  const peiHigh = res.PEI >= STATE.params.thresholds.pei;

  const cards = [
    { key: 'PSI', name: 'Pedestrian Safety Index', val: `${p} / 100`, raw: res.PSI, label: psiBand.label, badge: psiBand.badge, color: psiBand.color, rec: psiBand.rec },
    { key: 'SRI', name: 'Speed Risk Index', val: res.SRI.toFixed(2), raw: res.SRI, label: sriHigh ? 'Speeding (>1.0)' : 'Compliant (≤1.0)', badge: sriHigh ? 'badge-rose' : 'badge-emerald', color: sriHigh ? 'rose' : 'emerald', rec: sriHigh ? 'Enforce speed reduction, radar feedback and speed calming.' : 'Maintain existing speed regulatory measures.' },
    { key: 'CRI', name: 'Conflict Risk Index', val: Math.round(res.CRI).toLocaleString(), raw: res.CRI, label: criHigh ? 'Elevated Conflict' : 'Acceptable', badge: criHigh ? 'badge-rose' : 'badge-cyan', color: criHigh ? 'rose' : 'cyan', rec: criHigh ? 'Review turning movement protections and reduce conflict zones.' : 'Regular conflict surveillance.' },
    { key: 'PRI', name: 'Pedestrian Risk Index', val: Math.round(res.PRI).toLocaleString(), raw: res.PRI, label: priHigh ? 'High Ped Risk' : 'Normal', badge: priHigh ? 'badge-amber' : 'badge-emerald', color: priHigh ? 'amber' : 'emerald', rec: priHigh ? 'Minimise pedestrian wait time; optimize signal pedestrian phases.' : 'Pedestrian delay is within safe limits.' },
    { key: 'PEI', name: 'Pedestrian Exposure', val: Math.round(res.PEI).toLocaleString(), raw: res.PEI, label: peiHigh ? 'High Exposure' : 'Moderate', badge: peiHigh ? 'badge-indigo' : 'badge-cyan', color: peiHigh ? 'indigo' : 'cyan', rec: peiHigh ? 'Consider grade separation or dedicated pedestrian green intervals.' : 'Standard crossing capacity suffices.' }
  ];

  return { indices: res, cards };
}

// Backend Model Communication
async function checkBackendHealth() {
  const pill = $('#serverStatusPill');
  const dot = $('#serverStatusDot');
  const label = $('#serverStatusText');
  const startTime = performance.now();

  try {
    const res = await fetch(`${STATE.apiBase}/health`, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    STATE.model.status = 'online';
    STATE.model.latencyMs = Math.round(performance.now() - startTime);
    STATE.model.classes = data.classes || STATE.model.classes;
    STATE.model.engine = data.engine || 'YOLOv8';

    if (dot) dot.className = 'status-dot online';
    if (label) label.textContent = `YOLOv8 Engine Online (${STATE.model.latencyMs}ms)`;
  } catch (err) {
    STATE.model.status = 'offline';
    if (dot) dot.className = 'status-dot offline';
    if (label) label.textContent = 'YOLO Backend Offline (Click to connect)';
  }
}

// Load Sample Image
async function loadSampleImage() {
  try {
    const res = await fetch(`${STATE.apiBase}/sample-image`);
    if (!res.ok) throw new Error('Backend sample image endpoint returned ' + res.status);
    const blob = await res.blob();
    const file = new File([blob], 'traffic_sample.jpg', { type: 'image/jpeg' });
    handleImageSelect(file);
    setTimeout(() => {
      runYoloInference();
    }, 400);
  } catch (err) {
    // If backend endpoint fails, render generated traffic intersection frame
    createMockTrafficFrame();
  }
}

function createMockTrafficFrame() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');

  // Road background
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 800, 500);

  // Road lane markings
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(100, 0, 600, 500);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 4;
  ctx.setLineDash([20, 20]);
  ctx.beginPath();
  ctx.moveTo(400, 0); ctx.lineTo(400, 500);
  ctx.stroke();

  // Zebra crossing
  ctx.fillStyle = '#ffffff';
  ctx.setLineDash([]);
  for (let y = 180; y <= 320; y += 30) {
    ctx.fillRect(120, y, 560, 16);
  }

  // Vehicles & Pedestrians
  ctx.fillStyle = '#3b82f6'; // Car
  ctx.fillRect(240, 80, 80, 140);
  ctx.fillStyle = '#06b6d4'; // Bike
  ctx.fillRect(440, 360, 40, 70);
  ctx.fillStyle = '#10b981'; // Pedestrian
  ctx.beginPath(); ctx.arc(380, 250, 16, 0, Math.PI * 2); ctx.fill();

  canvas.toBlob(blob => {
    const file = new File([blob], 'intersection_simulation.jpg', { type: 'image/jpeg' });
    handleImageSelect(file);
  }, 'image/jpeg');
}

// File Selection Handlers
function handleImageSelect(file) {
  if (!file) return;
  STATE.ai.kind = 'image';
  STATE.ai.file = file;
  if (STATE.ai.fileUrl) URL.revokeObjectURL(STATE.ai.fileUrl);
  STATE.ai.fileUrl = URL.createObjectURL(file);
  STATE.ai.detections = [];
  STATE.ai.analyzed = false;
  STATE.ai.error = '';
  STATE.files.image = file.name;

  const img = new Image();
  img.onload = () => {
    STATE.ai.sourceImg = img;
    renderCanvasPreview();
  };
  img.src = STATE.ai.fileUrl;
  renderView();
}

// Load Sample Video
async function loadSampleVideo() {
  try {
    STATE.ai.kind = 'video';
    renderView();
    const res = await fetch(`${STATE.apiBase}/sample-video`);
    if (!res.ok) throw new Error('Backend sample video returned ' + res.status);
    const blob = await res.blob();
    const file = new File([blob], 'traffic_sample.mp4', { type: 'video/mp4' });
    handleVideoSelect(file);
    setTimeout(() => {
      runYoloInference();
    }, 400);
  } catch (err) {
    alert('Could not load sample video from server: ' + err.message);
  }
}

function handleVideoSelect(file) {
  if (!file) return;
  STATE.ai.kind = 'video';
  STATE.ai.file = file;
  if (STATE.ai.fileUrl) URL.revokeObjectURL(STATE.ai.fileUrl);
  STATE.ai.fileUrl = URL.createObjectURL(file);
  STATE.ai.annotatedVideoUrl = '';
  STATE.ai.videoViewMode = 'annotated';
  STATE.ai.videoResult = null;
  STATE.ai.analyzed = false;
  STATE.ai.error = '';
  STATE.files.video = file.name;
  renderView();
}

// YOLO Inference Execution
async function runYoloInference() {
  if (!STATE.ai.file || STATE.ai.running) return;

  STATE.ai.running = true;
  STATE.ai.error = '';
  renderView();

  const isVideo = STATE.ai.kind === 'video';
  const endpoint = isVideo ? '/api/video/analyze' : '/predict';
  const conf = STATE.ai.confidence / 100;
  const startT = performance.now();

  try {
    const formData = new FormData();
    formData.append('file', STATE.ai.file);

    // Video endpoint expects conf/iou as Form fields; image endpoint uses query params
    let fetchUrl;
    if (isVideo) {
      formData.append('conf', conf);
      formData.append('iou', '0.45');
      fetchUrl = `${STATE.apiBase}${endpoint}`;
    } else {
      fetchUrl = `${STATE.apiBase}${endpoint}?conf=${conf}`;
    }

    const response = await fetch(fetchUrl, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `Server returned error ${response.status}`);
    }

    const data = await response.json();
    STATE.ai.lastInferenceTime = Math.round(performance.now() - startT);
    STATE.ai.analyzed = true;

    if (isVideo) {
      // Backend returns a job_id for async video processing; poll for results
      STATE.ai.videoResult = data;
      if (data.job_id) {
        await pollVideoJob(data.job_id);
      }
    } else {
      STATE.ai.detections = data.detections || [];
      renderCanvasPreview();
    }
  } catch (err) {
    STATE.ai.error = `Inference failed: ${err.message}. Ensure the YOLO server is running at ${STATE.apiBase}`;
  } finally {
    STATE.ai.running = false;
    renderView();
  }
}

// Poll video processing job until complete
async function pollVideoJob(jobId) {
  const pollInterval = 2000; // ms
  const maxAttempts = 150;   // up to 5 minutes
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, pollInterval));
    try {
      const statusRes = await fetch(`${STATE.apiBase}/api/jobs/${jobId}`);
      if (!statusRes.ok) break;
      const statusData = await statusRes.json();
      STATE.ai.videoResult = { ...STATE.ai.videoResult, ...statusData };
      renderView();

      if (statusData.status === 'completed') {
        const resultsRes = await fetch(`${STATE.apiBase}/api/jobs/${jobId}/results`);
        if (resultsRes.ok) {
          const results = await resultsRes.json();
          STATE.ai.videoResult = results;
        }
        STATE.ai.annotatedVideoUrl = `${STATE.apiBase}/api/jobs/${jobId}/video?t=${Date.now()}`;
        STATE.ai.videoViewMode = 'annotated';
        STATE.ai.analyzed = true;
        renderView();
        return;
      } else if (statusData.status === 'failed') {
        throw new Error(statusData.error_message || 'Video processing failed on server.');
      }
    } catch (pollErr) {
      throw pollErr;
    }
  }
}

// Draw Detections on Canvas
function renderCanvasPreview() {
  const canvas = $('#detectionCanvas');
  if (!canvas || !STATE.ai.sourceImg) return;

  const img = STATE.ai.sourceImg;
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Palette by class
  const classColors = {
    car: '#3b82f6',
    bike: '#06b6d4',
    person: '#10b981',
    pedestrian: '#10b981',
    truck: '#8b5cf6',
    bus: '#f59e0b'
  };

  const scale = Math.max(1, canvas.width / 900);
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.font = `700 ${Math.round(14 * scale)}px 'JetBrains Mono', monospace`;

  STATE.ai.detections.forEach(det => {
    const [x1, y1, x2, y2] = det.bbox;
    const w = x2 - x1;
    const h = y2 - y1;
    const cName = (det.class || 'Object').toLowerCase();
    const color = classColors[cName] || '#06b6d4';

    // Bounding box with glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * scale;
    ctx.strokeStyle = color;
    ctx.strokeRect(x1, y1, w, h);
    ctx.shadowBlur = 0;

    // Corner brackets
    const corner = Math.min(18 * scale, w / 4, h / 4);
    ctx.lineWidth = Math.max(3, 4.5 * scale);
    ctx.beginPath();
    // Top-left
    ctx.moveTo(x1, y1 + corner); ctx.lineTo(x1, y1); ctx.lineTo(x1 + corner, y1);
    // Top-right
    ctx.moveTo(x2 - corner, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + corner);
    // Bottom-right
    ctx.moveTo(x2, y2 - corner); ctx.lineTo(x2, y2); ctx.lineTo(x2 - corner, y2);
    // Bottom-left
    ctx.moveTo(x1 + corner, y2); ctx.lineTo(x1, y2); ctx.lineTo(x1, y2 - corner);
    ctx.stroke();

    // Label pill
    const label = `${det.class.toUpperCase()} ${Math.round(det.confidence * 100)}%`;
    const textMetrics = ctx.measureText(label);
    const badgeW = textMetrics.width + 16 * scale;
    const badgeH = 22 * scale;
    const badgeY = Math.max(0, y1 - badgeH - 4);

    ctx.fillStyle = color;
    ctx.fillRect(x1, badgeY, badgeW, badgeH);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x1 + 8 * scale, badgeY + badgeH - 6 * scale);
  });
}

// Apply AI detections to Traffic Calculation State
function applyAiToCalculations() {
  if (!STATE.ai.analyzed) return;

  if (STATE.ai.kind === 'image') {
    let cars = 0, bikes = 0, trucks = 0, persons = 0;
    STATE.ai.detections.forEach(d => {
      const c = d.class.toLowerCase();
      if (c === 'car') cars++;
      else if (c === 'bike') bikes++;
      else if (c === 'truck') trucks++;
      else if (c === 'person') persons++;
    });

    const totalVeh = cars + bikes + trucks;
    if (totalVeh > 0) {
      STATE.params.tvAvg = Math.max(120, totalVeh * 18);
      STATE.params.tvMax = Math.round(STATE.params.tvAvg * 1.25);
      STATE.params.vehCount = totalVeh * 120;

      // Update composition
      STATE.composition = [
        { name: 'Cars', color: '#3b82f6', percent: Math.round((cars / totalVeh) * 100) || 50 },
        { name: 'Bikes / 2W', color: '#06b6d4', percent: Math.round((bikes / totalVeh) * 100) || 30 },
        { name: 'Trucks', color: '#8b5cf6', percent: Math.round((trucks / totalVeh) * 100) || 20 }
      ];
    }

    if (persons > 0) {
      STATE.params.pvAvg = Math.max(50, persons * 22);
      STATE.params.pvMax = Math.round(STATE.params.pvAvg * 1.3);
      STATE.params.pedCount = persons * 150;
    }
  } else if (STATE.ai.videoResult) {
    const vr = STATE.ai.videoResult;
    STATE.params.tvAvg = Math.round(vr.vehicle_detections || 350);
    STATE.params.tvMax = Math.round(STATE.params.tvAvg * 1.3);
    STATE.params.pvAvg = Math.round(vr.pedestrian_detections || 180);
    STATE.params.pvMax = Math.round(STATE.params.pvAvg * 1.25);
  }

  // Switch to dashboard and notify
  navigateTo('dash');
  alert('✨ AI detection metrics successfully synchronized with Traffic Safety calculations!');
}

// Navigation
function navigateTo(tabId) {
  STATE.currentTab = tabId;
  $$('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });
  renderView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Page View Renderers
const VIEWS = {
  dash() {
    const res = classifyIndices();
    const indices = res ? res.indices : { PSI: 0, SRI: 0, CRI: 0, PRI: 0, PEI: 0 };
    const psiVal = Math.round(indices.PSI);

    return `
      <div class="page-header">
        <div class="page-title-group">
          <h1>Intersection Overview</h1>
          <div class="page-subtitle">Real-time computer vision telemetry & multi-factor risk assessment</div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-primary btn-sm" onclick="navigateTo('ai')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
            Run YOLO Vision
          </button>
          <button class="btn btn-secondary btn-sm" onclick="navigateTo('reports')">
            Export Report
          </button>
        </div>
      </div>

      <div class="grid g4" style="margin-bottom:24px">
        <div class="stat-card accent-cyan">
          <div class="stat-header">
            <span class="stat-label">Average Speed</span>
            <div class="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
            </div>
          </div>
          <div class="stat-value">${STATE.params.spdAvg} <span style="font-size:16px;color:var(--text-secondary)">km/h</span></div>
          <div class="stat-sub">Limit: ${STATE.params.limit} km/h · Max: ${STATE.params.spdMax} km/h</div>
        </div>

        <div class="stat-card accent-amber">
          <div class="stat-header">
            <span class="stat-label">Peak Volume</span>
            <div class="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
            </div>
          </div>
          <div class="stat-value">${STATE.params.tvMax} <span style="font-size:16px;color:var(--text-secondary)">veh/int</span></div>
          <div class="stat-sub">Avg Volume: ${STATE.params.tvAvg} veh/interval</div>
        </div>

        <div class="stat-card accent-emerald">
          <div class="stat-header">
            <span class="stat-label">Pedestrian Count</span>
            <div class="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="2"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/></svg>
            </div>
          </div>
          <div class="stat-value">${STATE.params.pedCount.toLocaleString()}</div>
          <div class="stat-sub">Avg Wait Time: ${STATE.params.wtPed}s</div>
        </div>

        <div class="stat-card accent-rose">
          <div class="stat-header">
            <span class="stat-label">Conflict Events</span>
            <div class="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 22 2 22 12 2"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
          </div>
          <div class="stat-value">${STATE.params.conflicts}</div>
          <div class="stat-sub">Minimum TTC: ${STATE.params.ttc}s</div>
        </div>
      </div>

      <div class="grid g2" style="margin-bottom:24px">
        <!-- Live Indices Gauge Card -->
        <div class="card">
          <div class="card-title">
            <span>Pedestrian Safety Index (PSI)</span>
            <span class="badge ${psiVal > 80 ? 'badge-rose' : psiVal > 60 ? 'badge-amber' : 'badge-emerald'}">
              ${psiVal > 80 ? 'CRITICAL RISK' : psiVal > 60 ? 'HIGH RISK' : psiVal > 30 ? 'MODERATE' : 'OPTIMAL'}
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:32px;margin:20px 0">
            <div style="position:relative;width:120px;height:120px;display:flex;align-items:center;justify-content:center">
              <svg viewBox="0 0 100 100" style="width:100%;height:100%;transform:rotate(-90deg)">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10"/>
                <circle cx="50" cy="50" r="42" fill="none" 
                  stroke="${psiVal > 80 ? 'var(--rose)' : psiVal > 60 ? 'var(--amber)' : 'var(--emerald)'}" 
                  stroke-width="10" stroke-linecap="round"
                  stroke-dasharray="264"
                  stroke-dashoffset="${264 - (264 * psiVal) / 100}"
                  style="transition:stroke-dashoffset 0.8s ease"/>
              </svg>
              <div style="position:absolute;text-align:center">
                <div style="font-family:var(--font-mono);font-size:26px;font-weight:800">${psiVal}</div>
                <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Score / 100</div>
              </div>
            </div>
            <div style="flex:1">
              <div style="font-size:13px;line-height:1.6;color:var(--text-secondary)">
                ${res ? res.cards[0].rec : 'Complete parameters to view site safety recommendations.'}
              </div>
              <div style="margin-top:14px;display:flex;gap:12px;font-size:11.5px;color:var(--text-muted)">
                <span>TTC Factor: <b>${STATE.params.weights.ttc * 100}%</b></span>
                <span>Speed Factor: <b>${STATE.params.weights.vs * 100}%</b></span>
                <span>Volume: <b>${STATE.params.weights.tv * 100}%</b></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Vehicle Composition Card -->
        <div class="card">
          <div class="card-title">
            <span>Vehicle Classification Distribution</span>
            <span class="badge badge-indigo">YOLO Model Composition</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
            ${STATE.composition.map(c => `
              <div>
                <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px">
                  <span style="display:flex;align-items:center;gap:8px">
                    <span style="width:10px;height:10px;border-radius:2px;background:${c.color}"></span>
                    ${c.name}
                  </span>
                  <span style="font-family:var(--font-mono);font-weight:600">${c.percent}%</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${c.percent}%;background:${c.color}"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Live Indices Metric Grid -->
      <div class="card">
        <div class="card-title">
          <span>Active Risk Indices Summary</span>
          <span class="badge badge-cyan">Automated Safety Bands</span>
        </div>
        <div class="grid g4" style="margin-top:12px">
          ${res ? res.cards.slice(1).map(c => `
            <div style="padding:16px;background:rgba(255,255,255,0.02);border-radius:var(--radius-md);border:1px solid var(--border-subtle)">
              <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase">${c.name}</div>
              <div style="font-family:var(--font-mono);font-size:22px;font-weight:700;margin:6px 0;color:#fff">${c.val}</div>
              <span class="badge ${c.badge}">${c.label}</span>
              <p style="font-size:11.5px;color:var(--text-secondary);margin-top:8px">${c.rec}</p>
            </div>
          `).join('') : '<p>Indices calculating...</p>'}
        </div>
      </div>
    `;
  },

  ai() {
    // If a completed video job exists and annotatedVideoUrl is not yet set, configure it
    const activeJobId = STATE.ai.videoResult?.job_id;
    if (activeJobId && !STATE.ai.annotatedVideoUrl) {
      STATE.ai.annotatedVideoUrl = `${STATE.apiBase}/api/jobs/${activeJobId}/video`;
    }

    return `
      <div class="page-header">
        <div class="page-title-group">
          <h1>YOLOv8 Vision Detection Studio</h1>
          <div class="page-subtitle">Upload traffic intersection images or video streams for real-time computer vision analysis</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-emerald btn-sm" onclick="loadSampleImage()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            1-Click Sample Image
          </button>
          <button class="btn btn-secondary btn-sm" onclick="loadSampleVideo()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            1-Click Sample Video
          </button>
          <button class="btn btn-primary btn-sm" onclick="applyAiToCalculations()" ${STATE.ai.analyzed ? '' : 'disabled'}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            Sync with Safety Engine
          </button>
        </div>
      </div>

      <div class="grid g3" style="margin-bottom:24px">
        <!-- Controls & Upload -->
        <div class="card" style="display:flex;flex-direction:column;gap:16px">
          <div class="card-title">
            <span>Source Media</span>
            <span class="badge ${STATE.model.status === 'online' ? 'badge-emerald' : 'badge-rose'}">
              ${STATE.model.status === 'online' ? 'Backend Ready' : 'Backend Offline'}
            </span>
          </div>

          <!-- Tab Selector Image / Video -->
          <div style="display:flex;gap:8px;background:rgba(0,0,0,0.3);padding:4px;border-radius:var(--radius-md)">
            <button class="btn btn-sm ${STATE.ai.kind !== 'video' ? 'btn-primary' : 'btn-secondary'}" style="flex:1" onclick="STATE.ai.kind='image';renderView()">Image Mode</button>
            <button class="btn btn-sm ${STATE.ai.kind === 'video' ? 'btn-primary' : 'btn-secondary'}" style="flex:1" onclick="STATE.ai.kind='video';renderView()">Video Mode</button>
          </div>

          <!-- Dropzone -->
          <div class="dropzone" id="aiDropzone" onclick="$('#fileInput').click()">
            <input type="file" id="fileInput" hidden 
              accept="${STATE.ai.kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp'}" 
              onchange="${STATE.ai.kind === 'video' ? 'handleVideoSelect(this.files[0])' : 'handleImageSelect(this.files[0])'}">
            <div class="dropzone-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div>
              <div style="font-weight:700;font-size:13.5px;color:#fff">Click or drag & drop ${STATE.ai.kind === 'video' ? 'video' : 'image'}</div>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px">
                ${STATE.ai.kind === 'video' ? 'MP4, WebM, AVI (up to 500MB)' : 'JPG, PNG, WebP traffic photography'}
              </div>
            </div>
            ${STATE.ai.file ? `<div class="badge badge-cyan" style="word-break:break-all">${esc(STATE.ai.file.name)}</div>` : ''}
          </div>

          <!-- Confidence Threshold -->
          <div class="input-label">
            <div style="display:flex;justify-content:space-between">
              <span>Confidence Threshold</span>
              <span id="confValue" style="font-family:var(--font-mono);color:var(--cyan);font-weight:700">${STATE.ai.confidence}%</span>
            </div>
            <input type="range" min="10" max="90" value="${STATE.ai.confidence}" 
              oninput="STATE.ai.confidence=Number(this.value);$('#confValue').textContent=this.value+'%'">
          </div>

          <!-- Action Buttons -->
          <button class="btn btn-primary" onclick="runYoloInference()" ${STATE.ai.file && !STATE.ai.running ? '' : 'disabled'}>
            ${STATE.ai.running ? `
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Processing Inference...
            ` : `
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
              Analyze with YOLOv8
            `}
          </button>

          ${STATE.ai.running && STATE.ai.kind === 'video' && STATE.ai.videoResult && STATE.ai.videoResult.progress != null ? `
            <div style="margin-top:10px">
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:5px">
                <span>Frame ${STATE.ai.videoResult.current_frame || 0} / ${STATE.ai.videoResult.total_frames || '?'}</span>
                <span>${STATE.ai.videoResult.progress != null ? STATE.ai.videoResult.progress.toFixed(1) + '%' : ''}
                  ${STATE.ai.videoResult.eta_seconds != null ? ' · ETA ' + Math.round(STATE.ai.videoResult.eta_seconds) + 's' : ''}
                </span>
              </div>
              <div style="height:6px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${STATE.ai.videoResult.progress || 0}%;background:linear-gradient(90deg,var(--cyan),var(--indigo));border-radius:4px;transition:width 0.4s ease"></div>
              </div>
            </div>
          ` : ''}

          ${STATE.ai.error ? `<div style="font-size:12px;color:var(--rose);padding:10px;background:rgba(244,63,94,0.1);border-radius:var(--radius-sm)">${esc(STATE.ai.error)}</div>` : ''}
        </div>

        <!-- Detection View Stage -->
        <div class="card" style="grid-column:span 2;display:flex;flex-direction:column">
          <div class="card-title">
            <span>Visual Detection Viewport</span>
            <div style="display:flex;gap:8px">
              ${STATE.ai.lastInferenceTime ? `<span class="badge badge-indigo">Latency: ${STATE.ai.lastInferenceTime}ms</span>` : ''}
              ${STATE.ai.analyzed ? `<span class="badge badge-emerald">Inference Complete</span>` : ''}
            </div>
          </div>

          <div class="preview-stage" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:360px">
            ${STATE.ai.kind === 'video' ? `
              ${(STATE.ai.annotatedVideoUrl && STATE.ai.videoViewMode === 'annotated') ? `
                <div style="width:100%;display:flex;flex-direction:column;gap:10px">
                  <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.5);padding:8px 12px;border-radius:var(--radius-sm);border:1px solid rgba(16,185,129,0.3)">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span class="status-dot online"></span>
                      <span style="font-size:12.5px;font-weight:700;color:var(--emerald)">YOLOv8 Detection & Tracking Stream</span>
                      <span class="badge badge-emerald" style="font-size:10.5px">Boxes + IDs + Speeds</span>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center">
                      <button class="btn btn-xs ${STATE.ai.videoViewMode === 'annotated' ? 'btn-primary' : 'btn-secondary'}" onclick="STATE.ai.videoViewMode='annotated';renderView()">
                        Annotated Stream
                      </button>
                      <button class="btn btn-xs ${STATE.ai.videoViewMode === 'original' ? 'btn-primary' : 'btn-secondary'}" onclick="STATE.ai.videoViewMode='original';renderView()">
                        Raw Video
                      </button>
                      <a href="${STATE.ai.annotatedVideoUrl}" download="traffic_yolo_annotated.mp4" class="btn btn-xs btn-secondary" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download MP4
                      </a>
                    </div>
                  </div>
                  <video id="annotatedVideoPlayer" src="${STATE.ai.annotatedVideoUrl}" controls autoplay loop muted playsinline style="max-height:480px;width:100%;border-radius:var(--radius-md);box-shadow:0 10px 30px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.08)"></video>
                </div>
              ` : STATE.ai.fileUrl ? `
                <div style="width:100%;display:flex;flex-direction:column;gap:10px">
                  ${STATE.ai.annotatedVideoUrl ? `
                    <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.5);padding:8px 12px;border-radius:var(--radius-sm)">
                      <span style="font-size:12.5px;color:var(--text-muted)">Raw Source Video (Before Detection)</span>
                      <div style="display:flex;gap:8px">
                        <button class="btn btn-xs btn-primary" onclick="STATE.ai.videoViewMode='annotated';renderView()">
                          Switch to Annotated Stream
                        </button>
                      </div>
                    </div>
                  ` : ''}
                  <video src="${STATE.ai.fileUrl}" controls style="max-height:480px;width:100%;border-radius:var(--radius-md)"></video>
                </div>
              ` : `
                <div style="text-align:center;color:var(--text-muted);padding:40px">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;opacity:0.6"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><polyline points="10 9 15 12 10 15 10 9"/></svg>
                  <p style="font-size:14px">Upload a traffic video or click <b>"1-Click Sample Video"</b> to track vehicles and pedestrians with YOLOv8</p>
                </div>
              `}
            ` : `
              <canvas id="detectionCanvas" style="${STATE.ai.file ? '' : 'display:none'}"></canvas>
              ${!STATE.ai.file ? `
                <div style="text-align:center;color:var(--text-muted);padding:40px">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;opacity:0.6"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                  <p style="font-size:14px">Upload a frame or click <b>"1-Click Sample Image"</b> to preview YOLO bounding boxes</p>
                </div>
              ` : ''}
            `}
          </div>

          <!-- Result Pills -->
          ${STATE.ai.analyzed ? `
            <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
              ${STATE.ai.kind === 'video' && STATE.ai.videoResult ? (() => {
                const vr = STATE.ai.videoResult;
                const meta = vr.video_metadata || {};
                const counts = vr.counts || {};
                const classCounts = counts.class_counts || {};
                const totalVeh = counts.total_vehicles ?? vr.total_detections ?? '—';
                const totalPed = counts.total_pedestrians ?? '—';
                const dur = meta.duration_seconds != null ? meta.duration_seconds.toFixed(1) + 's' : '—';
                const procTime = vr.processing_time_sec != null ? vr.processing_time_sec.toFixed(1) + 's' : '';
                return [
                  `<span class="badge badge-emerald">Vehicles: <b>${totalVeh}</b></span>`,
                  `<span class="badge badge-cyan">Pedestrians: <b>${totalPed}</b></span>`,
                  `<span class="badge badge-indigo">Duration: <b>${dur}</b></span>`,
                  procTime ? `<span class="badge badge-amber">Processed in: <b>${procTime}</b></span>` : '',
                  ...Object.entries(classCounts).map(([k, v]) =>
                    `<span class="badge badge-rose">${k}: <b>${v}</b></span>`
                  )
                ].join('');
              })() : `
                <span class="badge badge-cyan">Total Detections: <b>${STATE.ai.detections.length}</b></span>
                ${['Car', 'Bike', 'Person', 'Truck'].map(cls => {
                  const cnt = STATE.ai.detections.filter(d => d.class.toLowerCase() === cls.toLowerCase()).length;
                  return cnt ? `<span class="badge badge-indigo">${cls}: <b>${cnt}</b></span>` : '';
                }).join('')}
              `}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  geometry() {
    return `
      <div class="page-header">
        <div class="page-title-group">
          <h1>Intersection Geometry</h1>
          <div class="page-subtitle">Schematic layout, approach lane allocation, and turning movement topology</div>
        </div>
      </div>

      <div class="grid g2" style="margin-bottom:24px">
        <div class="card" style="display:flex;align-items:center;justify-content:center;min-height:380px;background:#030712">
          <!-- SVG Schematic -->
          <svg viewBox="0 0 400 400" style="width:100%;max-width:380px;height:auto">
            <!-- Road crossings -->
            <rect x="150" y="0" width="100" height="400" fill="#1e293b"/>
            <rect x="0" y="150" width="400" height="100" fill="#1e293b"/>
            <!-- Center intersection -->
            <rect x="150" y="150" width="100" height="100" fill="#0f172a"/>
            <!-- Lane dividers -->
            <line x1="200" y1="0" x2="200" y2="150" stroke="#f8fafc" stroke-width="2" stroke-dasharray="8 8"/>
            <line x1="200" y1="250" x2="200" y2="400" stroke="#f8fafc" stroke-width="2" stroke-dasharray="8 8"/>
            <line x1="0" y1="200" x2="150" y2="200" stroke="#f8fafc" stroke-width="2" stroke-dasharray="8 8"/>
            <line x1="250" y1="200" x2="400" y2="200" stroke="#f8fafc" stroke-width="2" stroke-dasharray="8 8"/>
            <!-- Zebra crossings -->
            <line x1="150" y1="140" x2="250" y2="140" stroke="#ffffff" stroke-width="6" stroke-dasharray="6 6"/>
            <line x1="150" y1="260" x2="250" y2="260" stroke="#ffffff" stroke-width="6" stroke-dasharray="6 6"/>
            <line x1="140" y1="150" x2="140" y2="250" stroke="#ffffff" stroke-width="6" stroke-dasharray="6 6"/>
            <line x1="260" y1="150" x2="260" y2="250" stroke="#ffffff" stroke-width="6" stroke-dasharray="6 6"/>
            <!-- Labels -->
            <text x="200" y="30" fill="#94a3b8" font-size="12" font-weight="700" text-anchor="middle">NORTH ARM</text>
            <text x="200" y="380" fill="#94a3b8" font-size="12" font-weight="700" text-anchor="middle">SOUTH ARM</text>
            <text x="40" y="205" fill="#94a3b8" font-size="12" font-weight="700" text-anchor="middle">WEST</text>
            <text x="360" y="205" fill="#94a3b8" font-size="12" font-weight="700" text-anchor="middle">EAST</text>
          </svg>
        </div>

        <div class="card" style="display:flex;flex-direction:column;gap:16px">
          <div class="card-title">
            <span>Geometric Attributes</span>
            <span class="badge badge-cyan">4-Arm Signalized</span>
          </div>
          <table class="data-table">
            <thead>
              <tr><th>Approach</th><th>Carriageway</th><th>Lanes</th><th>Ped Phase</th></tr>
            </thead>
            <tbody>
              <tr><td>North (Primary)</td><td>7.30 m</td><td>2 (Divided)</td><td><span class="badge badge-emerald">Yes (18s)</span></td></tr>
              <tr><td>South (Primary)</td><td>7.30 m</td><td>2 (Divided)</td><td><span class="badge badge-emerald">Yes (18s)</span></td></tr>
              <tr><td>East (Cross)</td><td>6.50 m</td><td>2 (Undivided)</td><td><span class="badge badge-emerald">Yes (14s)</span></td></tr>
              <tr><td>West (Cross)</td><td>6.50 m</td><td>2 (Undivided)</td><td><span class="badge badge-emerald">Yes (14s)</span></td></tr>
            </tbody>
          </table>
          <p style="font-size:12px;color:var(--text-muted);margin-top:auto">
            Design Speed: <b>30 km/h</b> · Cycle Time: <b>90s</b> · Median Refuge Width: <b>1.2m</b>
          </p>
        </div>
      </div>
    `;
  },

  spatial() {
    return `
      <div class="page-header">
        <div class="page-title-group">
          <h1>Spatial Conflict Heatmap</h1>
          <div class="page-subtitle">5×5 Spatial grid density of vehicular and pedestrian conflict interactions</div>
        </div>
      </div>

      <div class="grid g2" style="margin-bottom:24px">
        <div class="card" style="display:flex;flex-direction:column;align-items:center">
          <div class="card-title" style="width:100%">
            <span>5×5 Conflict Density Grid</span>
            <span class="badge badge-rose">High Risk Core</span>
          </div>
          <div class="heatmap-container" style="margin-top:16px">
            ${STATE.heatmap.map((val, idx) => {
              const bg = `rgba(244, 63, 94, ${val})`;
              return `
                <div class="heatmap-cell" style="background:${bg};color:${val > 0.5 ? '#fff' : 'var(--text-muted)'}" title="Cell #${idx+1}: Risk Factor ${(val*100).toFixed(0)}%">
                  ${(val * 100).toFixed(0)}%
                </div>
              `;
            }).join('')}
          </div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:16px">
            Color intensity indicates conflict frequency (Red = high interaction density).
          </div>
        </div>

        <div class="card">
          <div class="card-title">
            <span>Conflict Distribution by Category</span>
            <span class="badge badge-cyan">${STATE.params.conflicts} Events Recorded</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:18px;margin-top:20px">
            <div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
                <span>Vehicle – Pedestrian Crossing</span>
                <span style="font-family:var(--font-mono);font-weight:700;color:var(--rose)">59%</span>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:59%;background:var(--rose)"></div></div>
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
                <span>Vehicle – Vehicle Turning Cross</span>
                <span style="font-family:var(--font-mono);font-weight:700;color:var(--amber)">32%</span>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:32%;background:var(--amber)"></div></div>
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
                <span>Pedestrian – Two-Wheeler Conflict</span>
                <span style="font-family:var(--font-mono);font-weight:700;color:var(--cyan)">9%</span>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:9%;background:var(--cyan)"></div></div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  safety() {
    const res = classifyIndices();
    return `
      <div class="page-header">
        <div class="page-title-group">
          <h1>Pedestrian Safety Indices & Mathematical Formulation</h1>
          <div class="page-subtitle">Standardized safety metrics calculated dynamically from vision and site telemetry</div>
        </div>
      </div>

      <div class="grid g2" style="margin-bottom:24px">
        ${res ? res.cards.map(c => `
          <div class="card" style="border-left:4px solid var(--${c.color})">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted)">${c.name} (${c.key})</div>
                <div style="font-family:var(--font-mono);font-size:32px;font-weight:800;color:#fff;margin:6px 0">${c.val}</div>
              </div>
              <span class="badge ${c.badge}">${c.label}</span>
            </div>
            <p style="font-size:13px;color:var(--text-secondary);margin-top:12px;line-height:1.5">
              ${c.rec}
            </p>
          </div>
        `).join('') : '<p>Indices calculating...</p>'}
      </div>

      <!-- Parameter Controls Card -->
      <div class="card">
        <div class="card-title">
          <span>Simulation Parameters Control</span>
          <span class="badge badge-indigo">Live Recalculation</span>
        </div>
        <div class="grid g4" style="margin-top:16px">
          ${[
            ['Speed Limit (km/h)', 'limit', 1],
            ['Avg Speed (km/h)', 'spdAvg', 0.5],
            ['Max Speed (km/h)', 'spdMax', 0.5],
            ['Avg Traffic Vol', 'tvAvg', 10],
            ['Avg Ped Vol', 'pvAvg', 5],
            ['Min TTC (s)', 'ttc', 0.1],
            ['Ped Wait Time (s)', 'wtPed', 1]
          ].map(([label, key, step]) => `
            <div class="input-label">
              <span>${label}</span>
              <input type="number" class="input-field" step="${step}" value="${STATE.params[key]}"
                onchange="STATE.params['${key}']=parseFloat(this.value)||0;renderView()">
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  problems() {
    return `
      <div class="page-header">
        <div class="page-title-group">
          <h1>Site Deficiencies Checklist</h1>
          <div class="page-subtitle">Identify field observations that trigger safety recommendations & combined countermeasure warrants</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:24px">
        <div class="card-title">
          <span>Observed Field Conditions</span>
          <span class="badge badge-rose">Click to toggle observation</span>
        </div>
        <div style="margin-top:16px">
          ${STATE.deficiencies.map((def, idx) => `
            <label class="deficiency-item">
              <input type="checkbox" ${STATE.observed[idx] ? 'checked' : ''} 
                onchange="STATE.observed[${idx}]=this.checked;renderView()">
              <div>
                <div style="font-size:14px;font-weight:700;color:#fff">${def.title}</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${def.desc}</div>
              </div>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  },

  countermeasures() {
    return `
      <div class="page-header">
        <div class="page-title-group">
          <h1>Engineering Countermeasures</h1>
          <div class="page-subtitle">Recommended geometric interventions, signal phasing modifications, and traffic calming measures</div>
        </div>
      </div>

      <div class="grid g2" style="margin-bottom:24px">
        <div class="card" style="border-top:3px solid var(--cyan)">
          <div class="card-title">
            <span>Pedestrian Refuge & Crossing Geometry</span>
            <span class="badge badge-cyan">Physical Treatment</span>
          </div>
          <ul style="font-size:13px;line-height:1.8;color:var(--text-secondary);padding-left:20px;margin-top:12px">
            <li>Install a raised median pedestrian refuge island of minimum width 1.8m.</li>
            <li>Construct curb extensions (bulb-outs) to shorten crossing distance by 3.2m.</li>
            <li>Apply high-visibility retroreflective thermoplastic zebra markings.</li>
          </ul>
        </div>

        <div class="card" style="border-top:3px solid var(--amber)">
          <div class="card-title">
            <span>Signal Phasing & Timing</span>
            <span class="badge badge-amber">Signal Intervention</span>
          </div>
          <ul style="font-size:13px;line-height:1.8;color:var(--text-secondary);padding-left:20px;margin-top:12px">
            <li>Implement Leading Pedestrian Interval (LPI) of 4 to 6 seconds before vehicular green.</li>
            <li>Restricted right/left turns across active pedestrian phases.</li>
            <li>Install countdown timers on all pedestrian crosswalk signal heads.</li>
          </ul>
        </div>
      </div>
    `;
  },

  reports() {
    return `
      <div class="page-header">
        <div class="page-title-group">
          <h1>Reports & Export Data</h1>
          <div class="page-subtitle">Generate engineering audit documentation, PDF summary sheets, and spreadsheet workbooks</div>
        </div>
      </div>

      <div class="grid g2" style="margin-bottom:24px">
        <div class="card">
          <div class="card-title">
            <span>Official Engineering PDF Report</span>
            <span class="badge badge-rose">PDF Format</span>
          </div>
          <p style="font-size:13px;color:var(--text-secondary);margin:12px 0 20px">
            Exports complete intersection summary including calculated PSI/SRI indices, YOLO computer vision detections, site deficiencies, and recommended countermeasures.
          </p>
          <button class="btn btn-rose" onclick="exportPdfReport()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download PDF Report
          </button>
        </div>

        <div class="card">
          <div class="card-title">
            <span>Excel Analysis Workbook</span>
            <span class="badge badge-emerald">XLSX Format</span>
          </div>
          <p style="font-size:13px;color:var(--text-secondary);margin:12px 0 20px">
            Exports multi-sheet workbook containing raw parameter variables, spatial heatmap matrices, and vehicle classification breakdown.
          </p>
          <button class="btn btn-emerald" onclick="exportExcelReport()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Excel Workbook
          </button>
        </div>
      </div>
    `;
  }
};

// Render Current View
function renderView() {
  const container = $('#mainContent');
  if (!container) return;
  const renderer = VIEWS[STATE.currentTab] || VIEWS.dash;
  container.innerHTML = renderer();

  if (STATE.currentTab === 'ai' && STATE.ai.kind !== 'video') {
    setTimeout(renderCanvasPreview, 50);
  }
}

// Exports
function exportPdfReport() {
  if (!window.jspdf) {
    alert('jsPDF library loading... Please verify internet connectivity.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const res = classifyIndices();

  doc.setFillColor(11, 17, 32);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('TRAFFIC AI – INTERSECTION SAFETY REPORT', 14, 18);

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(11);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 40);
  doc.text(`Model Engine: YOLOv8 (best.pt)`, 14, 48);

  let y = 62;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Calculated Safety Indices:', 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (res) {
    res.cards.forEach(c => {
      doc.text(`${c.name} (${c.key}): ${c.val}  [${c.label}]`, 14, y);
      y += 6;
      doc.text(`Recommendation: ${c.rec}`, 18, y);
      y += 8;
    });
  }

  doc.save('Traffic_AI_Safety_Report.pdf');
}

function exportExcelReport() {
  if (!window.XLSX) {
    alert('SheetJS library loading... Please verify internet connectivity.');
    return;
  }
  const wb = XLSX.utils.book_new();
  const paramsData = [
    ['Parameter', 'Value'],
    ['Speed Limit (km/h)', STATE.params.limit],
    ['Average Speed (km/h)', STATE.params.spdAvg],
    ['Max Speed (km/h)', STATE.params.spdMax],
    ['Traffic Volume', STATE.params.tvAvg],
    ['Pedestrian Volume', STATE.params.pvAvg],
    ['Minimum TTC (s)', STATE.params.ttc]
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(paramsData);
  XLSX.utils.book_append_sheet(wb, ws1, 'Parameters');
  XLSX.writeFile(wb, 'Traffic_AI_Data.xlsx');
}

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  renderView();
  checkBackendHealth();
  setInterval(checkBackendHealth, 10000);
});
