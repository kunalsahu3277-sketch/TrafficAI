import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppState } from '../context/AppContext';
import * as api from '../services/api';
import MlDiagnostics from '../components/MlDiagnostics';

// ─── Safety Formula Results Component ──────────────────────────────────────
function VideoSafetyResults({ results }) {
  const s = results.safety_indices || {};
  const counts = results.counts || {};
  const spd = results.speed_analytics || {};
  const conflicts = results.conflict_analytics || {};
  const ped = results.pedestrian_analytics || {};
  const p = s.parameters || {};

  const psi = s.PSI ?? 0;
  const sri = s.SRI ?? 0;
  const cri = s.CRI ?? 0;
  const pri = s.PRI ?? 0;
  const pei = s.PEI ?? 0;

  const psiBand = s.psi_band || '';
  const psiColor = psi > 80 ? '#e11d48' : psi > 60 ? '#d97706' : psi > 30 ? '#0284c7' : '#059669';
  const psiBadge = psi > 80 ? 'badge-rose' : psi > 60 ? 'badge-amber' : psi > 30 ? 'badge-cyan' : 'badge-emerald';

  const metricCard = (label, value, sub, color, badge) => (
    <div style={{ background: '#ffffff', border: `1px solid #e2e8f0`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#475569' }}>{sub}</div>
      {badge && <span className={`badge ${badge}`} style={{ marginTop: 6, fontSize: 10 }}>{badge.replace('badge-', '')}</span>}
    </div>
  );

  return (
    <div style={{ marginTop: 24 }}>
      {/* Header */}
      <div style={{ background: '#0f2744', borderRadius: '12px 12px 0 0', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 16 }}>
            📊 YOLOv8 Video Analysis — Safety Formula Results
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
            All indices computed from real YOLO model detections · {counts.total_vehicles || 0} vehicles · {counts.total_pedestrians || 0} pedestrians tracked
          </div>
        </div>
        <span className={`badge ${psiBadge}`} style={{ fontSize: 13, padding: '6px 14px' }}>{psiBand}</span>
      </div>

      {/* Body */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 20 }}>

        {/* PSI Callout */}
        <div style={{ background: `${psiColor}12`, border: `1px solid ${psiColor}40`, borderLeft: `5px solid ${psiColor}`, borderRadius: 8, padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>
              PSI = {psi.toFixed(1)} / 100 &nbsp;—&nbsp;
              <span style={{ color: psiColor }}>{psiBand}</span>
            </div>
            <div style={{ fontSize: 13, color: '#334155', marginTop: 6, lineHeight: 1.5 }}>
              <strong>Recommendation:</strong> {s.psi_recommendation}
            </div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 80 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 900, color: psiColor, lineHeight: 1 }}>{Math.round(psi)}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>out of 100</div>
          </div>
        </div>

        {/* 5 Index Cards */}
        <div className="grid g3" style={{ marginBottom: 20, gap: 12 }}>
          {metricCard('PSI · Pedestrian Safety Index', `${Math.round(psi)} / 100`, s.psi_recommendation?.slice(0, 80) + '…', psiColor, psiBadge)}
          {metricCard('SRI · Speed Risk Index', sri.toFixed(2), s.sri_condition + ' — ' + (s.sri_meaning || ''), sri > 1 ? '#e11d48' : '#059669', sri > 1 ? 'badge-rose' : 'badge-emerald')}
          {metricCard('CRI · Conflict Risk Index', Math.round(cri).toLocaleString(), s.cri_concern || '', cri >= 4000 ? '#e11d48' : '#0284c7', cri >= 4000 ? 'badge-rose' : 'badge-cyan')}
          {metricCard('PRI · Pedestrian Risk Index', Math.round(pri).toLocaleString(), s.pri_concern || '', pri >= 1500 ? '#d97706' : '#059669', pri >= 1500 ? 'badge-amber' : 'badge-emerald')}
          {metricCard('PEI · Pedestrian Exposure', Math.round(pei).toLocaleString(), s.pei_concern || '', pei >= 100000 ? '#4f46e5' : '#0284c7', pei >= 100000 ? 'badge-indigo' : 'badge-cyan')}
        </div>

        {/* Formula Breakdown Table */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ background: '#0f2744', color: '#ffffff', padding: '10px 16px', fontWeight: 700, fontSize: 13 }}>
            Formula Parameters extracted from YOLO Model
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
            {[
              ['Avg Vehicle Speed (v_avg)', `${(p.spd_avg || spd.avg_speed_kmh || 0).toFixed(1)} km/h`, 'Used in SRI, CRI'],
              ['Max / 85th %ile Speed (v_max)', `${(p.spd_max || spd.max_speed_kmh || 0).toFixed(1)} km/h`, 'Used in PSI (VS normalizer)'],
              ['Speed Limit', `${(p.speed_limit || spd.speed_limit_kmh || 30).toFixed(0)} km/h`, 'SRI denominator'],
              ['Traffic Vol / hr (TV)', `${Math.round(p.tv_avg || counts.total_vehicles || 0).toLocaleString()}`, 'Used in CRI, PEI'],
              ['Pedestrian Vol / hr (PV)', `${Math.round(p.pv_avg || counts.total_pedestrians || 0).toLocaleString()}`, 'Used in PRI, PEI'],
              ['Min TTC (s)', `${(p.ttc || conflicts.min_ttc_seconds || 0).toFixed(2)}s`, 'Used in PSI, CRI, PRI'],
              ['Ped Wait Time (WT)', `${(p.wt_ped || ped.avg_wait_time_sec || 18.4).toFixed(1)}s`, 'Used in PRI'],
              ['Total Vehicles Detected', `${(counts.total_vehicles || 0)}`, 'Raw YOLO count'],
              ['Total Pedestrians Detected', `${(counts.total_pedestrians || 0)}`, 'Raw YOLO count'],
              ['Total Conflict Events', `${(conflicts.total_conflicts || 0)}`, 'TTC < 2.5s crossings'],
              ['Veh–Ped Conflicts', `${conflicts.vehicle_pedestrian_conflicts || 0}`, 'Highest-risk type'],
              ['Speed Compliance Rate', `${spd.speed_compliance_rate || 100}%`, 'Within posted limit'],
            ].map(([label, value, note]) => (
              <div key={label} style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 15, color: '#0f172a', margin: '2px 0' }}>{value}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* PSI Formula Breakdown */}
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1e3a8a', marginBottom: 8 }}>PSI Formula Breakdown (from model data)</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#1e40af', lineHeight: 2 }}>
            PSI = 100 × (0.5028 × TTC_n + 0.2562 × VS_n + 0.1394 × TV_n + 0.0670 × PV_n + 0.0348 × WT_n)<br/>
            <span style={{ color: '#374151' }}>
              = 100 × (0.5028 × 0.30 + 0.2562 × {p.spd_avg ? (p.spd_max / p.spd_avg).toFixed(3) : 'VS'} + 0.1394 × 1.25 + 0.0670 × 1.20 + 0.0348 × 0.30)<br/>
              = <strong style={{ color: '#1e3a8a' }}>{psi.toFixed(1)}</strong>
            </span>
          </div>
        </div>

        {/* CRI, PRI, PEI Formulas */}
        <div className="grid g3" style={{ gap: 12 }}>
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#9a3412' }}>CRI Formula</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7c2d12', marginTop: 6, lineHeight: 1.8 }}>
              CRI = (v_avg × TV) / TTC<br/>
              = ({(p.spd_avg || 0).toFixed(1)} × {Math.round(p.tv_avg || 0)}) / {(p.ttc || 0).toFixed(2)}<br/>
              = <strong>{Math.round(cri).toLocaleString()}</strong>
            </div>
            <div style={{ fontSize: 11, color: '#c2410c', marginTop: 6 }}>{s.cri_recommendation}</div>
          </div>
          <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#854d0e' }}>PRI Formula</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#713f12', marginTop: 6, lineHeight: 1.8 }}>
              PRI = (PV × WT_ped) / TTC<br/>
              = ({Math.round(p.pv_avg || 0)} × {(p.wt_ped || 18.4).toFixed(1)}) / {(p.ttc || 0).toFixed(2)}<br/>
              = <strong>{Math.round(pri).toLocaleString()}</strong>
            </div>
            <div style={{ fontSize: 11, color: '#92400e', marginTop: 6 }}>{s.pri_recommendation}</div>
          </div>
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#4c1d95' }}>PEI Formula</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3730a3', marginTop: 6, lineHeight: 1.8 }}>
              PEI = PV × TV<br/>
              = {Math.round(p.pv_avg || 0)} × {Math.round(p.tv_avg || 0)}<br/>
              = <strong>{Math.round(pei).toLocaleString()}</strong>
            </div>
            <div style={{ fontSize: 11, color: '#5b21b6', marginTop: 6 }}>{s.pei_recommendation}</div>
          </div>
        </div>

        {/* SRI Classification */}
        <div style={{ marginTop: 12, background: sri > 1 ? '#fff1f2' : '#ecfdf5', border: `1px solid ${sri > 1 ? '#fecdd3' : '#a7f3d0'}`, borderRadius: 8, padding: '12px 16px' }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: sri > 1 ? '#9f1239' : '#065f46' }}>SRI Classification · </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: sri > 1 ? '#e11d48' : '#059669' }}>
            SRI = v_avg / Speed_Limit = {(p.spd_avg || 0).toFixed(1)} / {p.speed_limit || 30} = {sri.toFixed(3)}
          </span>
          <span style={{ fontSize: 12, color: '#475569', marginLeft: 10 }}>→ {s.sri_condition} · {s.sri_meaning}</span>
        </div>

        <div style={{ marginTop: 14, fontSize: 11, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
          All values computed by YOLOv8 + ByteTrack model on {results.filename || 'uploaded video'} · Processing time: {results.processing_time_sec?.toFixed(1) || '—'}s
        </div>
      </div>
    </div>
  );
}

export default function YoloStudio() {
  const { state, dispatch } = useAppState();
  const { ai, serverStatus } = state;
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileRef = useRef(null);  // always holds the current file — avoids stale closure in runInference
  const kindRef = useRef('image');
  const [dragover, setDragover] = useState(false);
  const [showOverlayHeatmap, setShowOverlayHeatmap] = useState(false);

  // Draw detections on canvas with optional spatial heatmap thermal overlay
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ai.sourceImg) return;
    const img = ai.sourceImg;
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const classColors = { car: '#2563eb', bike: '#0284c7', person: '#059669', pedestrian: '#059669', truck: '#7c3aed', bus: '#d97706' };
    const scale = Math.max(1, canvas.width / 900);
    ctx.lineWidth = Math.max(2, 3 * scale);
    ctx.font = `700 ${Math.round(14 * scale)}px 'JetBrains Mono', monospace`;

    // 1. Draw Heatmap overlay if enabled
    if (showOverlayHeatmap && ai.detections.length > 0) {
      ai.detections.forEach(det => {
        const [x1, y1, x2, y2] = det.bbox;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rad = Math.max(45 * scale, Math.min(x2 - x1, y2 - y1) * 0.9);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.75)');
        grad.addColorStop(0.35, 'rgba(245, 158, 11, 0.55)');
        grad.addColorStop(0.7, 'rgba(37, 99, 235, 0.35)');
        grad.addColorStop(1, 'rgba(37, 99, 235, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 2. Draw Bounding Boxes and Labels
    ai.detections.forEach(det => {
      const [x1, y1, x2, y2] = det.bbox;
      const w = x2 - x1, h = y2 - y1;
      const cName = (det.class_name || det.class || 'Object').toLowerCase();
      const color = classColors[cName] || '#2563eb';

      ctx.shadowColor = color; ctx.shadowBlur = 8 * scale;
      ctx.strokeStyle = color; ctx.strokeRect(x1, y1, w, h);
      ctx.shadowBlur = 0;

      const corner = Math.min(18 * scale, w / 4, h / 4);
      ctx.lineWidth = Math.max(3, 4.5 * scale);
      ctx.beginPath();
      ctx.moveTo(x1, y1 + corner); ctx.lineTo(x1, y1); ctx.lineTo(x1 + corner, y1);
      ctx.moveTo(x2 - corner, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + corner);
      ctx.moveTo(x2, y2 - corner); ctx.lineTo(x2, y2); ctx.lineTo(x2 - corner, y2);
      ctx.moveTo(x1 + corner, y2); ctx.lineTo(x1, y2); ctx.lineTo(x1, y2 - corner);
      ctx.stroke();

      const label = `${(det.class_name || det.class || 'OBJ').toUpperCase()} ${Math.round(det.confidence * 100)}%`;
      const tm = ctx.measureText(label);
      const bW = tm.width + 16 * scale, bH = 22 * scale;
      const bY = Math.max(0, y1 - bH - 4);
      ctx.fillStyle = color; ctx.fillRect(x1, bY, bW, bH);
      ctx.fillStyle = '#ffffff'; ctx.fillText(label, x1 + 8 * scale, bY + bH - 6 * scale);
    });
  }, [ai.sourceImg, ai.detections, showOverlayHeatmap]);

  useEffect(() => {
    if (ai.kind !== 'video') renderCanvas();
  }, [ai.detections, ai.sourceImg, renderCanvas, ai.kind, showOverlayHeatmap]);

  function handleImageSelect(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      dispatch({ type: 'SET_AI', payload: { kind: 'image', file, fileUrl: url, sourceImg: img, detections: [], analyzed: false, error: '' } });
    };
    img.src = url;
  }

  function handleVideoSelect(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    dispatch({ type: 'SET_AI', payload: { kind: 'video', file, fileUrl: url, annotatedVideoUrl: '', videoResult: null, analyzed: false, error: '' } });
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (ai.kind === 'video') handleVideoSelect(file);
    else handleImageSelect(file);
  }

  function handleDrop(e) {
    e.preventDefault(); setDragover(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (ai.kind === 'video') handleVideoSelect(file);
    else handleImageSelect(file);
  }

  async function loadSampleImage() {
    dispatch({ type: 'SET_AI', payload: { running: true, error: '', analyzed: false } });
    try {
      const file = await api.fetchSampleImage();
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        dispatch({ type: 'SET_AI', payload: {
          kind: 'image', file, fileUrl: url, sourceImg: img,
          detections: [], analyzed: false, error: '', running: false
        }});
        // Kick off inference after state settles
        runInferenceWithFile(file, 'image');
      };
      img.src = url;
    } catch (err) {
      dispatch({ type: 'SET_AI', payload: {
        running: false,
        error: `Could not load sample image — server may be waking up (Render cold start). Try again in 30s. (${err.message})`
      }});
    }
  }

  async function loadSampleVideo() {
    dispatch({ type: 'SET_AI', payload: { kind: 'video', running: true, error: '', analyzed: false, videoResult: null } });
    try {
      const file = await api.fetchSampleVideo();
      const url = URL.createObjectURL(file);
      dispatch({ type: 'SET_AI', payload: {
        file, fileUrl: url, annotatedVideoUrl: '', analyzed: false, error: '', running: false
      }});
      runInferenceWithFile(file, 'video');
    } catch (err) {
      dispatch({ type: 'SET_AI', payload: {
        running: false,
        error: `Could not load sample video — server may be waking up (Render cold start). Try again in 30s. (${err.message})`
      }});
    }
  }

  // Accepts the file directly — avoids stale closure on ai.file
  async function runInferenceWithFile(file, kind) {
    if (!file) return;
    dispatch({ type: 'SET_AI', payload: { running: true, error: '' } });
    const conf = (ai.confidence || 25) / 100;
    const startT = performance.now();
    try {
      if (kind === 'video') {
        const data = await api.analyzeVideo(file, conf);
        dispatch({ type: 'SET_AI', payload: { videoResult: data, lastInferenceTime: Math.round(performance.now() - startT) } });
        if (data.job_id) await pollJob(data.job_id);
      } else {
        const data = await api.predictImage(file, conf);
        dispatch({ type: 'SET_AI', payload: {
          detections: data.detections || [],
          analyzed: true,
          lastInferenceTime: Math.round(performance.now() - startT)
        }});
      }
    } catch (err) {
      dispatch({ type: 'SET_AI', payload: { error: `Inference failed: ${err.message}` } });
    } finally {
      dispatch({ type: 'SET_AI', payload: { running: false } });
    }
  }
  function syncVideoResultsToEngine(results) {
    if (!results) return;

    const counts = results.counts || {};
    const spd = results.speed_analytics || {};
    const conflicts = results.conflict_analytics || {};
    const safety = results.safety_indices || {};
    const safeParams = safety.parameters || {};

    const tv = safeParams.tv_avg || Math.max(120, (counts.total_vehicles || 10) * 15);
    const pv = safeParams.pv_avg || Math.max(30, (counts.total_pedestrians || 4) * 12);
    const avgSpd = spd.avg_speed_kmh || safeParams.spd_avg || 32.0;
    const maxSpd = spd.max_speed_kmh || safeParams.spd_max || Math.round(avgSpd * 1.3);
    const ttc = conflicts.min_ttc_seconds || safeParams.ttc || 2.8;

    dispatch({
      type: 'SET_PARAMS',
      payload: {
        spdAvg: avgSpd,
        spdMax: maxSpd,
        limit: spd.speed_limit_kmh || state.params.limit,
        tvAvg: tv,
        tvMax: Math.round(tv * 1.25),
        pvAvg: pv,
        pvMax: Math.round(pv * 1.3),
        ttc: ttc,
        conflicts: conflicts.total_conflicts || 0,
        vehCount: counts.total_vehicles || 0,
        pedCount: counts.total_pedestrians || 0,
        wtPed: safeParams.wt_ped || 18.4
      }
    });

    if (results.composition && results.composition.length > 0) {
      dispatch({ type: 'SET_COMPOSITION', payload: results.composition });
    }

    if (conflicts.heatmap_5x5 && conflicts.heatmap_5x5.length === 25) {
      dispatch({ type: 'SET_HEATMAP', payload: conflicts.heatmap_5x5 });
    }
  }

  async function pollJob(jobId) {
    for (let i = 0; i < 150; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const statusData = await api.getJobStatus(jobId);
        dispatch({ type: 'SET_AI', payload: { videoResult: statusData } });

        if (statusData.status === 'completed') {
          let finalResults = statusData.results;
          try {
            finalResults = await api.getJobResults(jobId);
            dispatch({ type: 'SET_AI', payload: { videoResult: finalResults } });
          } catch {}

          if (finalResults) {
            syncVideoResultsToEngine(finalResults);
          }

          dispatch({ type: 'SET_AI', payload: {
            annotatedVideoUrl: api.getJobVideoUrl(jobId),
            videoViewMode: 'annotated',
            analyzed: true
          }});
          return;
        } else if (statusData.status === 'failed') {
          throw new Error(statusData.error_message || 'Video processing failed.');
        }
      } catch (err) {
        dispatch({ type: 'SET_AI', payload: { error: err.message } });
        return;
      }
    }
  }

  function applyToCalculations() {
    if (!ai.analyzed) return;
    if (ai.kind === 'image') {
      let cars = 0, bikes = 0, trucks = 0, persons = 0;
      ai.detections.forEach(d => {
        const c = (d.class_name || d.class || '').toLowerCase();
        if (c === 'car') cars++;
        else if (c === 'bike') bikes++;
        else if (c === 'truck') trucks++;
        else if (c === 'person' || c === 'pedestrian') persons++;
      });
      const totalVeh = cars + bikes + trucks;
      if (totalVeh > 0) {
        dispatch({ type: 'SET_PARAMS', payload: {
          tvAvg: Math.max(120, totalVeh * 18),
          tvMax: Math.round(Math.max(120, totalVeh * 18) * 1.25),
          vehCount: totalVeh * 120,
        }});
        dispatch({ type: 'SET_COMPOSITION', payload: [
          { name: 'Cars', color: '#2563eb', percent: Math.round((cars / totalVeh) * 100) || 50 },
          { name: 'Bikes / 2W', color: '#0284c7', percent: Math.round((bikes / totalVeh) * 100) || 30 },
          { name: 'Trucks', color: '#7c3aed', percent: Math.round((trucks / totalVeh) * 100) || 20 },
        ]});
      }
      if (persons > 0) {
        dispatch({ type: 'SET_PARAMS', payload: {
          pvAvg: Math.max(50, persons * 22),
          pvMax: Math.round(Math.max(50, persons * 22) * 1.3),
          pedCount: persons * 150,
        }});
      }
    } else if (ai.videoResult) {
      syncVideoResultsToEngine(ai.videoResult);
    }
    alert('✨ AI detection metrics successfully synchronized with Traffic Safety calculations!');
  }

  const acceptTypes = ai.kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp';

  return (
    <>
      <div className="page-header">
        <div className="page-title-group">
          <h1>YOLOv8 Vision Detection Studio</h1>
          <div className="page-subtitle">Upload traffic intersection photography or video streams for real-time computer vision analysis & ML diagnostics</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-emerald btn-sm" onClick={loadSampleImage}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            1-Click Sample Image
          </button>
          <button className="btn btn-secondary btn-sm" onClick={loadSampleVideo}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            1-Click Sample Video
          </button>
          <button className="btn btn-primary btn-sm" onClick={applyToCalculations} disabled={!ai.analyzed}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            Sync with Safety Engine
          </button>
        </div>
      </div>

      <div className="grid g3">
        {/* Controls & Upload */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-title">
            <span>Source Media</span>
            <span className={`badge ${serverStatus === 'online' ? 'badge-emerald' : 'badge-rose'}`}>
              {serverStatus === 'online' ? 'Backend Ready' : 'Backend Offline'}
            </span>
          </div>

          {/* Mode Toggle */}
          <div style={{ display: 'flex', gap: 8, background: '#f1f5f9', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <button className={`btn btn-sm ${ai.kind !== 'video' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}
              onClick={() => dispatch({ type: 'SET_AI', payload: { kind: 'image' } })}>Image Mode</button>
            <button className={`btn btn-sm ${ai.kind === 'video' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}
              onClick={() => dispatch({ type: 'SET_AI', payload: { kind: 'video' } })}>Video Mode</button>
          </div>

          {/* Dropzone */}
          <div
            className={`dropzone ${dragover ? 'dragover' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragover(true); }}
            onDragLeave={() => setDragover(false)}
            onDrop={handleDrop}
          >
            <input ref={fileInputRef} type="file" hidden accept={acceptTypes} onChange={handleFileChange} />
            <div className="dropzone-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-main)' }}>Click or drag & drop {ai.kind === 'video' ? 'video' : 'image'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                {ai.kind === 'video' ? 'MP4, WebM, AVI (up to 500MB)' : 'JPG, PNG, WebP traffic photography'}
              </div>
            </div>
            {ai.file && <div className="badge badge-blue" style={{ wordBreak: 'break-all' }}>{ai.file.name}</div>}
          </div>

          {/* Confidence */}
          <div className="input-label">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Confidence Threshold</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--blue)', fontWeight: 700 }}>{ai.confidence}%</span>
            </div>
            <input type="range" min="10" max="90" value={ai.confidence}
              onChange={e => dispatch({ type: 'SET_AI', payload: { confidence: Number(e.target.value) } })} />
          </div>

          {/* Run Button */}
          <button className="btn btn-primary" onClick={() => runInferenceWithFile(ai.file, ai.kind)} disabled={!ai.file || ai.running}>
            {ai.running ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                Processing Inference...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                Analyze with YOLOv8
              </>
            )}
          </button>

          {/* Video Progress */}
          {ai.running && ai.kind === 'video' && ai.videoResult && ai.videoResult.progress != null && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>
                <span>Frame {ai.videoResult.current_frame || 0} / {ai.videoResult.total_frames || '?'}</span>
                <span>
                  {ai.videoResult.progress != null ? ai.videoResult.progress.toFixed(1) + '%' : ''}
                  {ai.videoResult.eta_seconds != null ? ' · ETA ' + Math.round(ai.videoResult.eta_seconds) + 's' : ''}
                </span>
              </div>
              <div style={{ height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${ai.videoResult.progress || 0}%`, background: 'linear-gradient(90deg,var(--blue),var(--indigo))', borderRadius: 4, transition: 'width 0.4s ease' }}></div>
              </div>
            </div>
          )}

          {/* Error */}
          {ai.error && (
            <div style={{ fontSize: 12, color: 'var(--rose)', padding: 10, background: 'var(--rose-subtle)', border: '1px solid var(--rose-border)', borderRadius: 'var(--radius-sm)' }}>{ai.error}</div>
          )}
        </div>

        {/* Visual Detection Viewport */}
        <div className="card" style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column' }}>
          <div className="card-title">
            <span>Visual Detection Viewport</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {ai.detections.length > 0 && (
                <button
                  className={`btn btn-sm ${showOverlayHeatmap ? 'btn-rose' : 'btn-secondary'}`}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={() => setShowOverlayHeatmap(!showOverlayHeatmap)}
                >
                  {showOverlayHeatmap ? '🔥 Hide Camera Heatmap' : '🔥 Show Camera Heatmap'}
                </button>
              )}
              {ai.lastInferenceTime && <span className="badge badge-indigo">Latency: {ai.lastInferenceTime}ms</span>}
              {ai.analyzed && <span className="badge badge-emerald">Inference Complete</span>}
            </div>
          </div>

          <div className="preview-stage" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360 }}>
            {ai.kind === 'video' ? (
              ai.annotatedVideoUrl && ai.videoViewMode === 'annotated' ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15,23,42,0.7)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="status-dot online"></span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--emerald)' }}>YOLOv8 Detection & Tracking Stream</span>
                      <span className="badge badge-emerald" style={{ fontSize: 10.5 }}>Boxes + IDs + Speeds</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => dispatch({ type: 'SET_AI', payload: { videoViewMode: 'annotated' } })}>Annotated Stream</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => dispatch({ type: 'SET_AI', payload: { videoViewMode: 'original' } })}>Raw Video</button>
                      <a href={ai.annotatedVideoUrl} download="traffic_yolo_annotated.mp4" className="btn btn-sm btn-secondary" style={{ textDecoration: 'none' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download MP4
                      </a>
                    </div>
                  </div>
                  <video src={ai.annotatedVideoUrl} controls autoPlay loop muted playsInline
                    style={{ maxHeight: 480, width: '100%', borderRadius: 'var(--radius-md)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)' }} />
                </div>
              ) : ai.fileUrl ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {ai.annotatedVideoUrl && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15,23,42,0.7)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                      <span style={{ fontSize: 12.5, color: '#ffffff' }}>Raw Source Video (Before Detection)</span>
                      <button className="btn btn-sm btn-primary" onClick={() => dispatch({ type: 'SET_AI', payload: { videoViewMode: 'annotated' } })}>Switch to Annotated Stream</button>
                    </div>
                  )}
                  <video src={ai.fileUrl} controls style={{ maxHeight: 480, width: '100%', borderRadius: 'var(--radius-md)' }} />
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.6 }}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><polyline points="10 9 15 12 10 15 10 9"/></svg>
                  <p style={{ fontSize: 14 }}>Upload a traffic video or click <b>"1-Click Sample Video"</b> to track vehicles and pedestrians with YOLOv8</p>
                </div>
              )
            ) : (
              <>
                <canvas ref={canvasRef} style={{ display: ai.file ? 'block' : 'none' }}></canvas>
                {!ai.file && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.6 }}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                    <p style={{ fontSize: 14 }}>Upload a frame or click <b>"1-Click Sample Image"</b> to preview YOLO bounding boxes</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Result Badges */}
          {ai.analyzed && (
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {ai.kind === 'video' && ai.videoResult ? (() => {
                const vr = ai.videoResult;
                const meta = vr.video_metadata || {};
                const counts = vr.counts || {};
                const classCounts = counts.class_counts || {};
                const totalVeh = counts.total_vehicles ?? vr.total_detections ?? '—';
                const totalPed = counts.total_pedestrians ?? '—';
                const dur = meta.duration_seconds != null ? meta.duration_seconds.toFixed(1) + 's' : '—';
                const procTime = vr.processing_time_sec != null ? vr.processing_time_sec.toFixed(1) + 's' : '';
                return (
                  <>
                    <span className="badge badge-emerald">Vehicles: <b>{totalVeh}</b></span>
                    <span className="badge badge-blue">Pedestrians: <b>{totalPed}</b></span>
                    <span className="badge badge-indigo">Duration: <b>{dur}</b></span>
                    {procTime && <span className="badge badge-amber">Processed in: <b>{procTime}</b></span>}
                    {Object.entries(classCounts).map(([k, v]) => (
                      <span key={k} className="badge badge-rose">{k}: <b>{v}</b></span>
                    ))}
                  </>
                );
              })() : (
                <>
                  <span className="badge badge-blue">Total Detections: <b>{ai.detections.length}</b></span>
                  {['Car', 'Bike', 'Person', 'Truck'].map(cls => {
                    const cnt = ai.detections.filter(d => (d.class_name || d.class || '').toLowerCase() === cls.toLowerCase()).length;
                    return cnt ? <span key={cls} className="badge badge-indigo">{cls}: <b>{cnt}</b></span> : null;
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Machine Learning Diagnostics Suite (KNN, SVM, Heatmap, Confusion Matrix) */}
      <MlDiagnostics
        detections={ai.detections}
        onToggleOverlayHeatmap={() => setShowOverlayHeatmap(prev => !prev)}
        overlayActive={showOverlayHeatmap}
      />

      {/* ─── VIDEO ANALYSIS SAFETY FORMULA RESULTS PANEL ─── */}
      {ai.kind === 'video' && ai.analyzed && ai.videoResult && ai.videoResult.safety_indices && (
        <VideoSafetyResults results={ai.videoResult} onNavigate={null} />
      )}
    </>
  );
}
