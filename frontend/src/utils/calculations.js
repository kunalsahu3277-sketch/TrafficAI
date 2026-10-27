// Safety index calculation functions

export function calculateIndices(params) {
  const S = params;
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

  return { ok: true, VSn, TVn, PVn, rawPSI, PSI, SRI, CRI, PRI, PEI };
}

export function classifyIndices(params) {
  const res = calculateIndices(params);
  if (!res.ok) return null;

  const p = Math.round(res.PSI);
  let psiBand = { label: 'Low concern', color: 'emerald', badge: 'badge-emerald', rec: 'Routine monitoring; maintain markings and signage.' };
  if (p > 80) psiBand = { label: 'Critical concern', color: 'rose', badge: 'badge-rose', rec: 'Detailed safety assessment & geometric intervention required.' };
  else if (p > 60) psiBand = { label: 'High concern', color: 'amber', badge: 'badge-amber', rec: 'Prioritise pedestrian safety; evaluate traffic calming & crossing refuge.' };
  else if (p > 30) psiBand = { label: 'Moderate concern', color: 'cyan', badge: 'badge-cyan', rec: 'Inspect crossing visibility, sightlines and approach speeds.' };

  const sriHigh = res.SRI > 1.0;
  const criHigh = res.CRI >= params.thresholds.cri;
  const priHigh = res.PRI >= params.thresholds.pri;
  const peiHigh = res.PEI >= params.thresholds.pei;

  const cards = [
    { key: 'PSI', name: 'Pedestrian Safety Index', val: `${p} / 100`, raw: res.PSI, label: psiBand.label, badge: psiBand.badge, color: psiBand.color, rec: psiBand.rec },
    { key: 'SRI', name: 'Speed Risk Index', val: res.SRI.toFixed(2), raw: res.SRI, label: sriHigh ? 'Speeding (>1.0)' : 'Compliant (≤1.0)', badge: sriHigh ? 'badge-rose' : 'badge-emerald', color: sriHigh ? 'rose' : 'emerald', rec: sriHigh ? 'Enforce speed reduction, radar feedback and speed calming.' : 'Maintain existing speed regulatory measures.' },
    { key: 'CRI', name: 'Conflict Risk Index', val: Math.round(res.CRI).toLocaleString(), raw: res.CRI, label: criHigh ? 'Elevated Conflict' : 'Acceptable', badge: criHigh ? 'badge-rose' : 'badge-cyan', color: criHigh ? 'rose' : 'cyan', rec: criHigh ? 'Review turning movement protections and reduce conflict zones.' : 'Regular conflict surveillance.' },
    { key: 'PRI', name: 'Pedestrian Risk Index', val: Math.round(res.PRI).toLocaleString(), raw: res.PRI, label: priHigh ? 'High Ped Risk' : 'Normal', badge: priHigh ? 'badge-amber' : 'badge-emerald', color: priHigh ? 'amber' : 'emerald', rec: priHigh ? 'Minimise pedestrian wait time; optimize signal pedestrian phases.' : 'Pedestrian delay is within safe limits.' },
    { key: 'PEI', name: 'Pedestrian Exposure', val: Math.round(res.PEI).toLocaleString(), raw: res.PEI, label: peiHigh ? 'High Exposure' : 'Moderate', badge: peiHigh ? 'badge-indigo' : 'badge-cyan', color: peiHigh ? 'indigo' : 'cyan', rec: peiHigh ? 'Consider grade separation or dedicated pedestrian green intervals.' : 'Standard crossing capacity suffices.' }
  ];

  return { indices: res, cards };
}
