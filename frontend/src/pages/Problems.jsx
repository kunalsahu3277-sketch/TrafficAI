import { useAppState } from '../context/AppContext';

export default function Problems() {
  const { state, dispatch } = useAppState();

  return (
    <>
      <div className="page-header">
        <div className="page-title-group">
          <h1>Site Deficiencies Checklist</h1>
          <div className="page-subtitle">Identify field observations that trigger safety recommendations & combined countermeasure warrants</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">
          <span>Observed Field Conditions</span>
          <span className="badge badge-rose">Click to toggle observation</span>
        </div>
        <div style={{ marginTop: 16 }}>
          {state.deficiencies.map((def, idx) => (
            <label key={idx} className="deficiency-item">
              <input type="checkbox" checked={!!state.observed[idx]}
                onChange={() => dispatch({ type: 'TOGGLE_OBSERVED', idx })} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{def.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{def.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
