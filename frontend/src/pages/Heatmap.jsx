import { useAppState } from '../context/AppContext';

export default function Heatmap() {
  const { state } = useAppState();

  return (
    <>
      <div className="page-header">
        <div className="page-title-group">
          <h1>Spatial Conflict Heatmap</h1>
          <div className="page-subtitle">5×5 Spatial grid density of vehicular and pedestrian conflict interactions</div>
        </div>
      </div>

      <div className="grid g2" style={{ marginBottom: 24 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="card-title" style={{ width: '100%' }}>
            <span>5×5 Conflict Density Grid</span>
            <span className="badge badge-rose">High Risk Core</span>
          </div>
          <div className="heatmap-container" style={{ marginTop: 16 }}>
            {state.heatmap.map((val, idx) => (
              <div key={idx} className="heatmap-cell"
                style={{ background: `rgba(244, 63, 94, ${val})`, color: val > 0.5 ? '#fff' : 'var(--text-muted)' }}
                title={`Cell #${idx + 1}: Risk Factor ${(val * 100).toFixed(0)}%`}>
                {(val * 100).toFixed(0)}%
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 16 }}>
            Color intensity indicates conflict frequency (Red = high interaction density).
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Conflict Distribution by Category</span>
            <span className="badge badge-cyan">{state.params.conflicts} Events Recorded</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 20 }}>
            {[
              { label: 'Vehicle – Pedestrian Crossing', pct: 59, color: 'var(--rose)' },
              { label: 'Vehicle – Vehicle Turning Cross', pct: 32, color: 'var(--amber)' },
              { label: 'Pedestrian – Two-Wheeler Conflict', pct: 9, color: 'var(--cyan)' }
            ].map((item, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span>{item.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: item.color }}>{item.pct}%</span>
                </div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${item.pct}%`, background: item.color }}></div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
