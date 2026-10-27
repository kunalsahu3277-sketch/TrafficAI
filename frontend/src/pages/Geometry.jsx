export default function Geometry() {
  return (
    <>
      <div className="page-header">
        <div className="page-title-group">
          <h1>Intersection Geometry</h1>
          <div className="page-subtitle">Schematic layout, approach lane allocation, and turning movement topology</div>
        </div>
      </div>

      <div className="grid g2" style={{ marginBottom: 24 }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 380, background: '#030712' }}>
          <svg viewBox="0 0 400 400" style={{ width: '100%', maxWidth: 380, height: 'auto' }}>
            <rect x="150" y="0" width="100" height="400" fill="#1e293b"/>
            <rect x="0" y="150" width="400" height="100" fill="#1e293b"/>
            <rect x="150" y="150" width="100" height="100" fill="#0f172a"/>
            <line x1="200" y1="0" x2="200" y2="150" stroke="#f8fafc" strokeWidth="2" strokeDasharray="8 8"/>
            <line x1="200" y1="250" x2="200" y2="400" stroke="#f8fafc" strokeWidth="2" strokeDasharray="8 8"/>
            <line x1="0" y1="200" x2="150" y2="200" stroke="#f8fafc" strokeWidth="2" strokeDasharray="8 8"/>
            <line x1="250" y1="200" x2="400" y2="200" stroke="#f8fafc" strokeWidth="2" strokeDasharray="8 8"/>
            <line x1="150" y1="140" x2="250" y2="140" stroke="#ffffff" strokeWidth="6" strokeDasharray="6 6"/>
            <line x1="150" y1="260" x2="250" y2="260" stroke="#ffffff" strokeWidth="6" strokeDasharray="6 6"/>
            <line x1="140" y1="150" x2="140" y2="250" stroke="#ffffff" strokeWidth="6" strokeDasharray="6 6"/>
            <line x1="260" y1="150" x2="260" y2="250" stroke="#ffffff" strokeWidth="6" strokeDasharray="6 6"/>
            <text x="200" y="30" fill="#94a3b8" fontSize="12" fontWeight="700" textAnchor="middle">NORTH ARM</text>
            <text x="200" y="380" fill="#94a3b8" fontSize="12" fontWeight="700" textAnchor="middle">SOUTH ARM</text>
            <text x="40" y="205" fill="#94a3b8" fontSize="12" fontWeight="700" textAnchor="middle">WEST</text>
            <text x="360" y="205" fill="#94a3b8" fontSize="12" fontWeight="700" textAnchor="middle">EAST</text>
          </svg>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-title">
            <span>Geometric Attributes</span>
            <span className="badge badge-cyan">4-Arm Signalized</span>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Approach</th><th>Carriageway</th><th>Lanes</th><th>Ped Phase</th></tr>
            </thead>
            <tbody>
              <tr><td>North (Primary)</td><td>7.30 m</td><td>2 (Divided)</td><td><span className="badge badge-emerald">Yes (18s)</span></td></tr>
              <tr><td>South (Primary)</td><td>7.30 m</td><td>2 (Divided)</td><td><span className="badge badge-emerald">Yes (18s)</span></td></tr>
              <tr><td>East (Cross)</td><td>6.50 m</td><td>2 (Undivided)</td><td><span className="badge badge-emerald">Yes (14s)</span></td></tr>
              <tr><td>West (Cross)</td><td>6.50 m</td><td>2 (Undivided)</td><td><span className="badge badge-emerald">Yes (14s)</span></td></tr>
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 'auto' }}>
            Design Speed: <b>30 km/h</b> · Cycle Time: <b>90s</b> · Median Refuge Width: <b>1.2m</b>
          </p>
        </div>
      </div>
    </>
  );
}
