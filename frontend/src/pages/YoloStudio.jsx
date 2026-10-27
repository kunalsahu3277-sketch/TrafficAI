import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppState } from '../context/AppContext';
import * as api from '../services/api';
import MlDiagnostics from '../components/MlDiagnostics';

export default function YoloStudio() {
  const { state, dispatch } = useAppState();
  const { ai, serverStatus } = state;
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
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
    try {
      const file = await api.fetchSampleImage();
      handleImageSelect(file);
      setTimeout(() => runInference(), 400);
    } catch {
      dispatch({ type: 'SET_AI', payload: { error: 'Could not load sample image from server.' } });
    }
  }

  async function loadSampleVideo() {
    try {
      dispatch({ type: 'SET_AI', payload: { kind: 'video' } });
      const file = await api.fetchSampleVideo();
      handleVideoSelect(file);
      setTimeout(() => runInference(), 400);
    } catch (err) {
      dispatch({ type: 'SET_AI', payload: { error: 'Could not load sample video: ' + err.message } });
    }
  }

  async function runInference() {
    if (!ai.file || ai.running) return;
    dispatch({ type: 'SET_AI', payload: { running: true, error: '' } });
    const conf = ai.confidence / 100;
    const startT = performance.now();

    try {
      if (ai.kind === 'video') {
        const data = await api.analyzeVideo(ai.file, conf);
        dispatch({ type: 'SET_AI', payload: { videoResult: data, lastInferenceTime: Math.round(performance.now() - startT) } });
        if (data.job_id) await pollJob(data.job_id);
      } else {
        const data = await api.predictImage(ai.file, conf);
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

  async function pollJob(jobId) {
    for (let i = 0; i < 150; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const statusData = await api.getJobStatus(jobId);
        dispatch({ type: 'SET_AI', payload: { videoResult: statusData } });

        if (statusData.status === 'completed') {
          try {
            const results = await api.getJobResults(jobId);
            dispatch({ type: 'SET_AI', payload: { videoResult: results } });
          } catch {}
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
      const vr = ai.videoResult;
      dispatch({ type: 'SET_PARAMS', payload: {
        tvAvg: Math.round(vr.vehicle_detections || 350),
        tvMax: Math.round((vr.vehicle_detections || 350) * 1.3),
        pvAvg: Math.round(vr.pedestrian_detections || 180),
        pvMax: Math.round((vr.pedestrian_detections || 180) * 1.25),
      }});
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
          <button className="btn btn-primary" onClick={runInference} disabled={!ai.file || ai.running}>
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
    </>
  );
}
