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

  // Live evaluated values
  const currentPsi = res ? Math.round(res.indices.PSI) : 0;
  const currentSri = res ? res.indices.SRI : 0;
  const currentCri = res ? Math.round(res.indices.CRI) : 0;
  const currentPri = res ? Math.round(res.indices.PRI) : 0;
  const currentPei = res ? Math.round(res.indices.PEI) : 0;

  const isCriHigh = res ? currentCri >= state.params.thresholds.cri : false;
  const isPriHigh = res ? currentPri >= state.params.thresholds.pri : false;
  const isPeiHigh = res ? currentPei >= state.params.thresholds.pei : false;

  return (
    <>
      <div className="page-header">
        <div className="page-title-group">
          <h1>Pedestrian Safety Indices & Mathematical Formulation</h1>
          <div className="page-subtitle">Standardized safety metrics calculated dynamically from vision and site telemetry</div>
        </div>
      </div>

      {/* Primary KPI Metric Cards */}
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

      {/* SECTION 3: Provisional categories and index-specific rules */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 14, marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f2744', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>3. Provisional categories and index-specific rules</span>
            <span className="badge badge-indigo" style={{ fontSize: 11, fontWeight: 600 }}>Standardized Framework</span>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Formal classification matrix mapping computed index values to operational engineering interventions.
          </p>
        </div>

        {/* 1. PSI Categories */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 8 }}>
              PSI categories supplied for this project
            </h3>
            <span className="badge badge-blue" style={{ fontFamily: 'var(--font-mono)' }}>
              Live PSI: {currentPsi} / 100
            </span>
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #cbd5e1' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#0f2744', color: '#ffffff' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700, width: '15%' }}>PSI range</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, width: '22%' }}>Project interpretation</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, width: '48%' }}>Recommendation</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, width: '15%', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {/* 0-30 */}
                <tr style={{
                  background: currentPsi <= 30 ? 'rgba(5, 150, 105, 0.08)' : '#ffffff',
                  borderBottom: '1px solid #e2e8f0',
                  fontWeight: currentPsi <= 30 ? 600 : 400
                }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#059669' }}>0–30</td>
                  <td style={{ padding: '12px 16px', color: '#0f172a' }}>Low concern</td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>Routine monitoring; maintain pedestrian facilities, signs, markings and unobstructed routes.</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {currentPsi <= 30 && <span className="badge badge-emerald">Active</span>}
                  </td>
                </tr>
                {/* 31-60 */}
                <tr style={{
                  background: (currentPsi >= 31 && currentPsi <= 60) ? 'rgba(2, 132, 199, 0.08)' : '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  fontWeight: (currentPsi >= 31 && currentPsi <= 60) ? 600 : 400
                }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0284c7' }}>31–60</td>
                  <td style={{ padding: '12px 16px', color: '#0f172a' }}>Moderate concern</td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>Inspect crossing location, markings, signs, visibility, vehicle speeds and waiting conditions.</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {(currentPsi >= 31 && currentPsi <= 60) && <span className="badge badge-cyan">Active</span>}
                  </td>
                </tr>
                {/* 61-80 */}
                <tr style={{
                  background: (currentPsi >= 61 && currentPsi <= 80) ? 'rgba(217, 119, 6, 0.08)' : '#ffffff',
                  borderBottom: '1px solid #e2e8f0',
                  fontWeight: (currentPsi >= 61 && currentPsi <= 80) ? 600 : 400
                }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#d97706' }}>61–80</td>
                  <td style={{ padding: '12px 16px', color: '#0f172a' }}>High concern</td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>Prioritise pedestrian safety assessment; investigate speed, conflicts, refuge or controlled crossing options where justified.</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {(currentPsi >= 61 && currentPsi <= 80) && <span className="badge badge-amber">Active</span>}
                  </td>
                </tr>
                {/* 81-100 */}
                <tr style={{
                  background: currentPsi >= 81 ? 'rgba(225, 29, 72, 0.08)' : '#f8fafc',
                  fontWeight: currentPsi >= 81 ? 600 : 400
                }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#e11d48' }}>81–100</td>
                  <td style={{ padding: '12px 16px', color: '#0f172a' }}>Critical concern</td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>Detailed site assessment and applicable IRC warrant checks; stronger measures only where justified.</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {currentPsi >= 81 && <span className="badge badge-rose">Active</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 8 }}>
            These are proposed TrafficCalc categories, not official IRC risk classifications.
          </div>
        </div>

        {/* 2. SRI Categories */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 8 }}>
              SRI categories
            </h3>
            <span className="badge badge-blue" style={{ fontFamily: 'var(--font-mono)' }}>
              Live SRI: {currentSri.toFixed(2)} (Limit: {state.params.limit} km/h)
            </span>
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #cbd5e1' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#0f2744', color: '#ffffff' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700, width: '18%' }}>Condition</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, width: '34%' }}>Meaning</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, width: '38%' }}>Recommendation</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, width: '10%', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {/* SRI < 1 */}
                <tr style={{
                  background: currentSri < 1 ? 'rgba(5, 150, 105, 0.08)' : '#ffffff',
                  borderBottom: '1px solid #e2e8f0',
                  fontWeight: currentSri < 1 ? 600 : 400
                }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#059669' }}>SRI &lt; 1</td>
                  <td style={{ padding: '12px 16px', color: '#0f172a' }}>Speed in numerator is below the applicable limit.</td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>Maintain signs/markings; monitor speed distribution and visibility.</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {currentSri < 1 && <span className="badge badge-emerald">Active</span>}
                  </td>
                </tr>
                {/* SRI = 1 */}
                <tr style={{
                  background: Math.abs(currentSri - 1) < 0.01 ? 'rgba(2, 132, 199, 0.08)' : '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  fontWeight: Math.abs(currentSri - 1) < 0.01 ? 600 : 400
                }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0284c7' }}>SRI = 1</td>
                  <td style={{ padding: '12px 16px', color: '#0f172a' }}>Speed in numerator equals the applicable limit.</td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>Check full speed distribution and intersection conditions.</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {Math.abs(currentSri - 1) < 0.01 && <span className="badge badge-cyan">Active</span>}
                  </td>
                </tr>
                {/* SRI > 1 */}
                <tr style={{
                  background: currentSri > 1.01 ? 'rgba(225, 29, 72, 0.08)' : '#ffffff',
                  fontWeight: currentSri > 1.01 ? 600 : 400
                }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#e11d48' }}>SRI &gt; 1</td>
                  <td style={{ padding: '12px 16px', color: '#0f172a' }}>Speed in numerator exceeds the applicable limit.</td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>Investigate speeding, sight distance and suitable speed management; assess traffic calming only if appropriate.</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {currentSri > 1.01 && <span className="badge badge-rose">Active</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. CRI, PRI and PEI Categories */}
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e3a8a', marginBottom: 12 }}>
            CRI, PRI and PEI categories
          </h3>

          {/* Callout box as per spec */}
          <div style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderLeft: '4px solid #2563eb',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 14,
            fontSize: 13,
            lineHeight: 1.5,
            color: '#1e3a8a',
            fontWeight: 500
          }}>
            <strong>Rule:</strong> Use Low / Moderate / High / Critical only after defining calibrated numerical thresholds. Until then, use data-relative flags such as <em>'higher than the site\'s baseline'</em> or <em>'requires review'</em> and label them provisional.
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #cbd5e1' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#0f2744', color: '#ffffff' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700, width: '18%' }}>Index & Live Value</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, width: '41%' }}>Lower / moderate concern</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, width: '41%' }}>High / critical concern</th>
                </tr>
              </thead>
              <tbody>
                {/* CRI */}
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                  <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>CRI</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      Value: <strong>{currentCri.toLocaleString()}</strong>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span className={`badge ${isCriHigh ? 'badge-rose' : 'badge-emerald'}`} style={{ fontSize: 10 }}>
                        {isCriHigh ? 'High Concern' : 'Normal / Low'}
                      </span>
                    </div>
                  </td>
                  <td style={{
                    padding: '12px 16px',
                    color: '#334155',
                    verticalAlign: 'top',
                    background: !isCriHigh ? 'rgba(5, 150, 105, 0.06)' : 'transparent'
                  }}>
                    Maintain traffic controls; review conflict points, turning movements and TTC observations.
                  </td>
                  <td style={{
                    padding: '12px 16px',
                    color: '#334155',
                    verticalAlign: 'top',
                    background: isCriHigh ? 'rgba(225, 29, 72, 0.06)' : 'transparent'
                  }}>
                    Prioritise conflict assessment; investigate speed, turning movements and crossing control; major treatments require site review.
                  </td>
                </tr>

                {/* PRI */}
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>PRI</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      Value: <strong>{currentPri.toLocaleString()}</strong>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span className={`badge ${isPriHigh ? 'badge-amber' : 'badge-emerald'}`} style={{ fontSize: 10 }}>
                        {isPriHigh ? 'High Concern' : 'Normal / Low'}
                      </span>
                    </div>
                  </td>
                  <td style={{
                    padding: '12px 16px',
                    color: '#334155',
                    verticalAlign: 'top',
                    background: !isPriHigh ? 'rgba(5, 150, 105, 0.06)' : 'transparent'
                  }}>
                    Monitor waiting time, crossing opportunities and pedestrian waiting areas.
                  </td>
                  <td style={{
                    padding: '12px 16px',
                    color: '#334155',
                    verticalAlign: 'top',
                    background: isPriHigh ? 'rgba(217, 119, 6, 0.06)' : 'transparent'
                  }}>
                    Investigate unsafe crossing attempts, long waits, TTC and signal/crossing arrangements.
                  </td>
                </tr>

                {/* PEI */}
                <tr style={{ background: '#ffffff' }}>
                  <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>PEI</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      Value: <strong>{currentPei.toLocaleString()}</strong>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span className={`badge ${isPeiHigh ? 'badge-indigo' : 'badge-cyan'}`} style={{ fontSize: 10 }}>
                        {isPeiHigh ? 'High Exposure' : 'Normal / Low'}
                      </span>
                    </div>
                  </td>
                  <td style={{
                    padding: '12px 16px',
                    color: '#334155',
                    verticalAlign: 'top',
                    background: !isPeiHigh ? 'rgba(2, 132, 199, 0.06)' : 'transparent'
                  }}>
                    Maintain pedestrian routes; review crossing placement and demand.
                  </td>
                  <td style={{
                    padding: '12px 16px',
                    color: '#334155',
                    verticalAlign: 'top',
                    background: isPeiHigh ? 'rgba(79, 70, 229, 0.06)' : 'transparent'
                  }}>
                    Assess crossing demand, width, refuge and control using peak-hour flows and applicable criteria.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 8 }}>
            Do not copy PSI's 0–100 scale to CRI, PRI or PEI. Their raw values have different units and scales. Establish thresholds from comparable site data and engineering review.
          </div>
        </div>
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
