import { useAppState } from '../context/AppContext';
import { classifyIndices } from '../utils/calculations';

export default function Dashboard({ onNavigate }) {
  const { state } = useAppState();
  const res = classifyIndices(state.params);
  const indices = res ? res.indices : { PSI: 0, SRI: 0, CRI: 0, PRI: 0, PEI: 0 };
  const psiVal = Math.round(indices.PSI);

  return (
    <>
      <div className="page-header">
        <div className="page-title-group">
          <h1>Intersection Overview</h1>
          <div className="page-subtitle">Real-time computer vision telemetry & multi-factor risk assessment</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate('ai')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>
            </svg>
            Run YOLO Vision
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('reports')}>Export Report</button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid g4" style={{ marginBottom: 24 }}>
        <div className="stat-card accent-cyan">
          <div className="stat-header">
            <span className="stat-label">Average Speed</span>
            <div className="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
            </div>
          </div>
          <div className="stat-value">{state.params.spdAvg} <span style={{ fontSize: 16, color: 'var(--text-secondary)' }}>km/h</span></div>
          <div className="stat-sub">Limit: {state.params.limit} km/h · Max: {state.params.spdMax} km/h</div>
        </div>

        <div className="stat-card accent-amber">
          <div className="stat-header">
            <span className="stat-label">Peak Volume</span>
            <div className="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
            </div>
          </div>
          <div className="stat-value">{state.params.tvMax} <span style={{ fontSize: 16, color: 'var(--text-secondary)' }}>veh/int</span></div>
          <div className="stat-sub">Avg Volume: {state.params.tvAvg} veh/interval</div>
        </div>

        <div className="stat-card accent-emerald">
          <div className="stat-header">
            <span className="stat-label">Pedestrian Count</span>
            <div className="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="2"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/></svg>
            </div>
          </div>
          <div className="stat-value">{state.params.pedCount.toLocaleString()}</div>
          <div className="stat-sub">Avg Wait Time: {state.params.wtPed}s</div>
        </div>

        <div className="stat-card accent-rose">
          <div className="stat-header">
            <span className="stat-label">Conflict Events</span>
            <div className="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 22 22 2 22 12 2"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
          </div>
          <div className="stat-value">{state.params.conflicts}</div>
          <div className="stat-sub">Minimum TTC: {state.params.ttc}s</div>
        </div>
      </div>

      {/* PSI Gauge + Composition */}
      <div className="grid g2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">
            <span>Pedestrian Safety Index (PSI)</span>
            <span className={`badge ${psiVal > 80 ? 'badge-rose' : psiVal > 60 ? 'badge-amber' : 'badge-emerald'}`}>
              {psiVal > 80 ? 'CRITICAL RISK' : psiVal > 60 ? 'HIGH RISK' : psiVal > 30 ? 'MODERATE' : 'OPTIMAL'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32, margin: '20px 0' }}>
            <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="10"/>
                <circle cx="50" cy="50" r="42" fill="none"
                  stroke={psiVal > 80 ? 'var(--rose)' : psiVal > 60 ? 'var(--amber)' : 'var(--emerald)'}
                  strokeWidth="10" strokeLinecap="round"
                  strokeDasharray="264"
                  strokeDashoffset={264 - (264 * psiVal) / 100}
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}/>
              </svg>
              <div style={{ position: 'absolute', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 800, color: 'var(--text-main)' }}>{psiVal}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Score / 100</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                {res ? res.cards[0].rec : 'Complete parameters to view site safety recommendations.'}
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 12, fontSize: 11.5, color: 'var(--text-muted)' }}>
                <span>TTC Factor: <b>{state.params.weights.ttc * 100}%</b></span>
                <span>Speed Factor: <b>{state.params.weights.vs * 100}%</b></span>
                <span>Volume: <b>{state.params.weights.tv * 100}%</b></span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Vehicle Classification Distribution</span>
            <span className="badge badge-indigo">YOLO Model Composition</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            {state.composition.map((c, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: c.color }}></span>
                    {c.name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{c.percent}%</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${c.percent}%`, background: c.color }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active Risk Indices Summary */}
      <div className="card">
        <div className="card-title">
          <span>Active Risk Indices Summary</span>
          <span className="badge badge-blue">Automated Safety Bands</span>
        </div>
        <div className="grid g4" style={{ marginTop: 12 }}>
          {res ? res.cards.slice(1).map(c => (
            <div key={c.key} style={{ padding: 16, background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{c.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 800, margin: '6px 0', color: 'var(--text-main)' }}>{c.val}</div>
              <span className={`badge ${c.badge}`}>{c.label}</span>
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 8 }}>{c.rec}</p>
            </div>
          )) : <p>Indices calculating...</p>}
        </div>
      </div>
    </>
  );
}
