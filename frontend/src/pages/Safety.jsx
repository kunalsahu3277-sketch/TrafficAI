import { useAppState } from '../context/AppContext';
import { classifyIndices } from '../utils/calculations';

export default function Safety() {
  const { state, dispatch } = useAppState();
  const res = classifyIndices(state.params);

  const paramFields = [
    ['Speed Limit (km/h)', 'limit', 1],
    ['Avg Speed (km/h)', 'spdAvg', 0.5],
    ['Max Speed (km/h)', 'spdMax', 0.5],
    ['Avg Traffic Vol', 'tvAvg', 10],
    ['Avg Ped Vol', 'pvAvg', 5],
    ['Min TTC (s)', 'ttc', 0.1],
    ['Ped Wait Time (s)', 'wtPed', 1]
  ];

  return (
    <>
      <div className="page-header">
        <div className="page-title-group">
          <h1>Pedestrian Safety Indices & Mathematical Formulation</h1>
          <div className="page-subtitle">Standardized safety metrics calculated dynamically from vision and site telemetry</div>
        </div>
      </div>

      <div className="grid g2" style={{ marginBottom: 24 }}>
        {res ? res.cards.map(c => (
          <div key={c.key} className="card" style={{ borderLeft: `4px solid var(--${c.color})` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{c.name} ({c.key})</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 800, color: 'var(--text-main)', margin: '6px 0' }}>{c.val}</div>
              </div>
              <span className={`badge ${c.badge}`}>{c.label}</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.5 }}>{c.rec}</p>
          </div>
        )) : <p>Indices calculating...</p>}
      </div>

      {/* Parameter Controls */}
      <div className="card">
        <div className="card-title">
          <span>Simulation Parameters Control</span>
          <span className="badge badge-indigo">Live Recalculation</span>
        </div>
        <div className="grid g4" style={{ marginTop: 16 }}>
          {paramFields.map(([label, key, step]) => (
            <div key={key} className="input-label">
              <span>{label}</span>
              <input type="number" className="input-field" step={step}
                value={state.params[key]}
                onChange={e => dispatch({ type: 'SET_PARAM', key, value: parseFloat(e.target.value) || 0 })} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
