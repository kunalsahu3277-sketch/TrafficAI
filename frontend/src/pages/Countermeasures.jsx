export default function Countermeasures() {
  return (
    <>
      <div className="page-header">
        <div className="page-title-group">
          <h1>Engineering Countermeasures</h1>
          <div className="page-subtitle">Recommended geometric interventions, signal phasing modifications, and traffic calming measures</div>
        </div>
      </div>

      <div className="grid g2" style={{ marginBottom: 24 }}>
        <div className="card" style={{ borderTop: '3px solid var(--cyan)' }}>
          <div className="card-title">
            <span>Pedestrian Refuge & Crossing Geometry</span>
            <span className="badge badge-cyan">Physical Treatment</span>
          </div>
          <ul style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)', paddingLeft: 20, marginTop: 12 }}>
            <li>Install a raised median pedestrian refuge island of minimum width 1.8m.</li>
            <li>Construct curb extensions (bulb-outs) to shorten crossing distance by 3.2m.</li>
            <li>Apply high-visibility retroreflective thermoplastic zebra markings.</li>
          </ul>
        </div>

        <div className="card" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="card-title">
            <span>Signal Phasing & Timing</span>
            <span className="badge badge-amber">Signal Intervention</span>
          </div>
          <ul style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)', paddingLeft: 20, marginTop: 12 }}>
            <li>Implement Leading Pedestrian Interval (LPI) of 4 to 6 seconds before vehicular green.</li>
            <li>Restricted right/left turns across active pedestrian phases.</li>
            <li>Install countdown timers on all pedestrian crosswalk signal heads.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
