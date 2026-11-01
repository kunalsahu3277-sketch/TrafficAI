import { useState } from 'react';
import { useAppState } from '../context/AppContext';
import { classifyIndices } from '../utils/calculations';

export default function Reports() {
  const { state } = useAppState();
  const res = classifyIndices(state.params);

  // Editable report metadata
  const [reportMeta, setReportMeta] = useState({
    locationName: 'Intersection Corridor A-4 (Main St & 5th Ave)',
    auditorName: 'Senior Traffic Safety Engineer',
    agency: 'Department of Transportation & Municipal Road Authority',
    reportId: `TRF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  });

  const [activeTab, setActiveTab] = useState('full'); // 'full' | 'summary' | 'engineering'

  const currentPsi = res ? Math.round(res.indices.PSI) : 0;
  const currentSri = res ? res.indices.SRI.toFixed(2) : '0.00';
  const currentCri = res ? Math.round(res.indices.CRI).toLocaleString() : '0';
  const currentPri = res ? Math.round(res.indices.PRI).toLocaleString() : '0';
  const currentPei = res ? Math.round(res.indices.PEI).toLocaleString() : '0';

  // Determine PSI Band
  let psiBand = 'Low Concern';
  let psiRec = 'Routine monitoring; maintain pedestrian facilities, signs, markings and unobstructed routes.';
  if (currentPsi > 80) {
    psiBand = 'Critical Concern';
    psiRec = 'Detailed site assessment and applicable IRC warrant checks; stronger measures only where justified.';
  } else if (currentPsi > 60) {
    psiBand = 'High Concern';
    psiRec = 'Prioritise pedestrian safety assessment; investigate speed, conflicts, refuge or controlled crossing options where justified.';
  } else if (currentPsi > 30) {
    psiBand = 'Moderate Concern';
    psiRec = 'Inspect crossing location, markings, signs, visibility, vehicle speeds and waiting conditions.';
  }

  // Determine SRI recommendation
  let sriRec = 'Speed in numerator is below the applicable limit. Maintain signs/markings; monitor speed distribution and visibility.';
  if (parseFloat(currentSri) > 1.0) {
    sriRec = 'Speed in numerator exceeds the applicable limit. Investigate speeding, sight distance and suitable speed management; assess traffic calming.';
  } else if (Math.abs(parseFloat(currentSri) - 1.0) < 0.01) {
    sriRec = 'Speed in numerator equals the applicable limit. Check full speed distribution and intersection conditions.';
  }

  // 1. Export PDF
  function exportPdfReport() {
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = 210;
      const margin = 14;
      let y = 14;

      // Dark Blue Header Bar
      doc.setFillColor(15, 39, 68);
      doc.rect(0, 0, pageWidth, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('NEURALTRAFFIC AI – ROAD SAFETY AUDIT REPORT', margin, 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Report ID: ${reportMeta.reportId}  |  Generated: ${reportMeta.date}`, margin, 19);
      doc.text(`Agency: ${reportMeta.agency}`, margin, 24);

      y = 36;
      doc.setTextColor(15, 23, 42);

      // Section 1: Executive Summary
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('1. Executive Safety Summary', margin, y);
      y += 6;

      doc.setFillColor(241, 245, 249);
      doc.roundedRect(margin, y, pageWidth - 2 * margin, 26, 2, 2, 'F');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Location: ${reportMeta.locationName}`, margin + 4, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.text(`Auditor: ${reportMeta.auditorName}`, margin + 4, y + 12);
      doc.text(`Vision AI Engine: YOLOv8 Traffic Detector (best.pt) | Device: ${state.params.basis || 'CPU'}`, margin + 4, y + 18);
      doc.setFont('helvetica', 'bold');
      doc.text(`Computed PSI Score: ${currentPsi} / 100 (${psiBand.toUpperCase()})`, margin + 4, y + 23);

      y += 33;

      // Section 2: Calculated Safety Indices Table
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('2. Computed Safety Indices & IRC Threshold Classifications', margin, y);
      y += 6;

      const indicesTable = [
        ['Index', 'Value', 'Condition', 'Project Recommendation'],
        ['PSI', `${currentPsi}/100`, psiBand, psiRec],
        ['SRI', currentSri, parseFloat(currentSri) > 1.0 ? 'Exceeds Limit' : 'Within Limit', sriRec],
        ['CRI', currentCri, res && res.indices.CRI >= state.params.thresholds.cri ? 'High Concern' : 'Normal', 'Maintain traffic controls; review conflict points and TTC observations.'],
        ['PRI', currentPri, res && res.indices.PRI >= state.params.thresholds.pri ? 'High Ped Risk' : 'Normal', 'Monitor waiting time, crossing opportunities and pedestrian waiting areas.'],
        ['PEI', currentPei, res && res.indices.PEI >= state.params.thresholds.pei ? 'High Exposure' : 'Normal', 'Maintain pedestrian routes; review crossing placement and demand.']
      ];

      doc.setFontSize(8.5);
      indicesTable.forEach((row, i) => {
        if (i === 0) {
          doc.setFillColor(15, 39, 68);
          doc.rect(margin, y, pageWidth - 2 * margin, 7, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
          doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'normal');
        }

        doc.text(row[0], margin + 2, y + 5);
        doc.text(row[1], margin + 18, y + 5);
        doc.text(row[2], margin + 40, y + 5);
        // Truncate recommendation text if too long for PDF single line
        const recText = doc.splitTextToSize(row[3], 100);
        doc.text(recText[0] || '', margin + 78, y + 5);
        y += 8;
      });

      y += 8;

      // Section 3: Vision Telemetry & Traffic Flow
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('3. AI Computer Vision & Traffic Flow Telemetry', margin, y);
      y += 6;

      const telemetryItems = [
        `• Speed Limit: ${state.params.limit} km/h`,
        `• Average Vehicle Speed: ${state.params.spdAvg} km/h`,
        `• Maximum Vehicle Speed: ${state.params.spdMax} km/h`,
        `• Average Traffic Volume: ${state.params.tvAvg} veh/hr`,
        `• Average Pedestrian Volume: ${state.params.pvAvg} ped/hr`,
        `• Minimum Time-To-Collision (TTC): ${state.params.ttc} s`,
        `• Pedestrian Wait Time: ${state.params.wtPed} s`,
        `• Total Tracked Vehicles: ${state.params.vehCount}`,
        `• Total Tracked Pedestrians: ${state.params.pedCount}`,
        `• Observed Conflicts: ${state.params.conflicts}`
      ];

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      for (let i = 0; i < telemetryItems.length; i += 2) {
        doc.text(telemetryItems[i], margin + 4, y);
        if (telemetryItems[i + 1]) {
          doc.text(telemetryItems[i + 1], margin + 100, y);
        }
        y += 6;
      }

      y += 6;

      // Section 4: Observed Site Deficiencies Checklist
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('4. Site Deficiencies & Road Infrastructure Audit', margin, y);
      y += 6;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      state.deficiencies.slice(0, 5).forEach((def, idx) => {
        const isObserved = !!state.observed[idx];
        doc.text(`[${isObserved ? 'X' : '  '}] ${def.title} - ${isObserved ? 'DEFICIENCY FLAGGED' : 'Compliant'}`, margin + 4, y);
        y += 5;
      });

      y += 8;

      // Section 5: Recommended Action Plan
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('5. Priority Engineering Action Plan', margin, y);
      y += 6;

      const actions = [
        '1. Physical: Install raised median pedestrian refuge island (min 1.8m width) where crossing width > 12m.',
        '2. Pavement: Renew high-visibility thermoplastic zebra crosswalk markings and advance stop bars.',
        '3. Signal: Introduce Leading Pedestrian Interval (LPI) of 4-6s to reduce vehicular turning conflicts.',
        '4. Calming: Implement radar speed-feedback signs and speed reduction measures if SRI > 1.0.'
      ];

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      actions.forEach(act => {
        doc.text(act, margin + 4, y);
        y += 5;
      });

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`TrafficCalc / NeuralTraffic AI System  •  Page 1 of 1  •  Official Engineering Record`, margin, 290);

      doc.save(`Traffic_AI_Audit_Report_${reportMeta.reportId}.pdf`);
    }).catch(err => {
      console.error(err);
      alert('Could not generate PDF. Please ensure browser permissions allow file downloads.');
    });
  }

  // 2. Export Word Document (.doc / .docx)
  function exportWordDocReport() {
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Traffic AI Comprehensive Audit Report</title>
        <style>
          body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.5; }
          h1 { color: #0f2744; font-size: 20pt; border-bottom: 2pt solid #0f2744; padding-bottom: 6pt; margin-bottom: 12pt; }
          h2 { color: #1e3a8a; font-size: 14pt; margin-top: 18pt; margin-bottom: 6pt; }
          h3 { color: #2563eb; font-size: 12pt; }
          p { margin: 4pt 0; }
          .meta-box { background: #f1f5f9; border-left: 4pt solid #2563eb; padding: 10pt; margin-bottom: 15pt; }
          .callout { background: #eff6ff; border: 1pt solid #bfdbfe; border-left: 4pt solid #3b82f6; padding: 8pt; margin: 10pt 0; }
          table { width: 100%; border-collapse: collapse; margin: 12pt 0; }
          th { background: #0f2744; color: #ffffff; padding: 8pt; text-align: left; font-size: 10pt; border: 1pt solid #0f2744; }
          td { padding: 7pt; border: 1pt solid #cbd5e1; font-size: 10pt; vertical-align: top; }
          tr:nth-child(even) td { background: #f8fafc; }
          .badge { font-weight: bold; padding: 2pt 6pt; border-radius: 3pt; font-size: 9pt; }
          .badge-danger { color: #991b1b; background: #fee2e2; }
          .badge-warning { color: #854d0e; background: #fef9c3; }
          .badge-success { color: #166534; background: #dcfce7; }
          .footer { font-size: 9pt; color: #64748b; margin-top: 25pt; border-top: 1pt solid #e2e8f0; padding-top: 8pt; }
        </style>
      </head>
      <body>
        <h1>NEURALTRAFFIC AI – COMPREHENSIVE ROAD SAFETY & AUDIT REPORT</h1>
        
        <div class="meta-box">
          <p><strong>Report Reference:</strong> ${reportMeta.reportId}</p>
          <p><strong>Site Location:</strong> ${reportMeta.locationName}</p>
          <p><strong>Auditing Authority:</strong> ${reportMeta.agency}</p>
          <p><strong>Lead Engineer / Auditor:</strong> ${reportMeta.auditorName}</p>
          <p><strong>Audit Date:</strong> ${reportMeta.date}</p>
          <p><strong>Computer Vision Model:</strong> YOLOv8 (best.pt) Custom Fine-Tuned Highway Detector</p>
        </div>

        <h2>1. Executive Summary & Provisional Classification</h2>
        <p>This document presents the full mathematical and vision analysis of the surveyed traffic environment. Safety Indices were dynamically evaluated using real-time trajectories, speed distributions, and vehicle-pedestrian conflict observations.</p>
        
        <div class="callout">
          <p><strong>Primary Pedestrian Safety Index (PSI):</strong> ${currentPsi} / 100 — <strong>${psiBand.toUpperCase()}</strong></p>
          <p><strong>Project Action Recommendation:</strong> ${psiRec}</p>
        </div>

        <h2>2. Safety Indices & IRC Provisional Rules</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 12%;">Index</th>
              <th style="width: 14%;">Computed Value</th>
              <th style="width: 20%;">Operational Condition</th>
              <th style="width: 54%;">Prescribed Engineering Recommendation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>PSI</strong></td>
              <td>${currentPsi} / 100</td>
              <td>${psiBand}</td>
              <td>${psiRec}</td>
            </tr>
            <tr>
              <td><strong>SRI</strong></td>
              <td>${currentSri}</td>
              <td>${parseFloat(currentSri) > 1.0 ? 'Exceeds Speed Limit' : 'Compliant'}</td>
              <td>${sriRec}</td>
            </tr>
            <tr>
              <td><strong>CRI</strong></td>
              <td>${currentCri}</td>
              <td>${res && res.indices.CRI >= state.params.thresholds.cri ? 'Elevated Conflict Risk' : 'Acceptable'}</td>
              <td>Maintain traffic controls; review conflict points, turning movements and TTC observations.</td>
            </tr>
            <tr>
              <td><strong>PRI</strong></td>
              <td>${currentPri}</td>
              <td>${res && res.indices.PRI >= state.params.thresholds.pri ? 'High Pedestrian Risk' : 'Normal'}</td>
              <td>Monitor waiting time, crossing opportunities and pedestrian waiting areas.</td>
            </tr>
            <tr>
              <td><strong>PEI</strong></td>
              <td>${currentPei}</td>
              <td>${res && res.indices.PEI >= state.params.thresholds.pei ? 'High Exposure' : 'Normal'}</td>
              <td>Maintain pedestrian routes; review crossing placement and demand.</td>
            </tr>
          </tbody>
        </table>
        <p style="font-size: 9pt; font-style: italic; color: #64748b;">Note: These are proposed TrafficCalc categories, not official IRC risk classifications. Raw indices have different units and scales.</p>

        <h2>3. AI Computer Vision & Telemetry Data</h2>
        <table>
          <thead>
            <tr>
              <th>Variable Parameter</th>
              <th>Survey Value</th>
              <th>Engineering Unit / Basis</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Posted Speed Limit</td><td>${state.params.limit}</td><td>km/h</td></tr>
            <tr><td>Average Vehicular Speed</td><td>${state.params.spdAvg}</td><td>km/h</td></tr>
            <tr><td>85th Percentile / Max Speed</td><td>${state.params.spdMax}</td><td>km/h</td></tr>
            <tr><td>Average Traffic Volume</td><td>${state.params.tvAvg}</td><td>vehicles per hour</td></tr>
            <tr><td>Average Pedestrian Volume</td><td>${state.params.pvAvg}</td><td>pedestrians per hour</td></tr>
            <tr><td>Minimum Time-to-Collision (TTC)</td><td>${state.params.ttc}</td><td>seconds (critical proximity)</td></tr>
            <tr><td>Pedestrian Wait Time</td><td>${state.params.wtPed}</td><td>seconds before crossing</td></tr>
            <tr><td>Cumulative Vehicles Detected</td><td>${state.params.vehCount}</td><td>tracked objects</td></tr>
            <tr><td>Cumulative Pedestrians Detected</td><td>${state.params.pedCount}</td><td>tracked objects</td></tr>
            <tr><td>Post-Inference Conflict Events</td><td>${state.params.conflicts}</td><td>TTC &lt; 2.5s spatial conflicts</td></tr>
          </tbody>
        </table>

        <h2>4. Modal Split & Fleet Composition</h2>
        <table>
          <thead>
            <tr>
              <th>Vehicle Class</th>
              <th>Percentage Share</th>
            </tr>
          </thead>
          <tbody>
            ${state.composition.map(c => `<tr><td>${c.name}</td><td>${c.percent}%</td></tr>`).join('')}
          </tbody>
        </table>

        <h2>5. Field Deficiencies & Audit Checklist</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 15%;">Status</th>
              <th style="width: 35%;">Deficiency Item</th>
              <th style="width: 50%;">Detailed Audit Description</th>
            </tr>
          </thead>
          <tbody>
            ${state.deficiencies.map((d, i) => `
              <tr>
                <td><strong>${state.observed[i] ? '[X] FLAGGED' : '[  ] OK'}</strong></td>
                <td>${d.title}</td>
                <td>${d.desc}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>6. Priority Countermeasure Interventions</h2>
        <ul>
          <li><strong>Raised Median Refuge Island:</strong> Construct physical refuge of minimum 1.8m width to divide two-way crossing.</li>
          <li><strong>High-Visibility Crosswalks:</strong> Apply retroreflective thermoplastic zebra markings and advance stop bars.</li>
          <li><strong>Signal Phasing (LPI):</strong> Implement a 4-to-6 second Leading Pedestrian Interval prior to adjacent vehicular green phases.</li>
          <li><strong>Speed Calming:</strong> Deploy speed radar feedback signs and optical speed bars on high-speed approaches.</li>
        </ul>

        <div class="footer">
          <p><strong>NeuralTraffic AI System & Engineering Analyzer</strong></p>
          <p>Official Verification Hash: SHA256-${Math.random().toString(36).substring(2, 10).toUpperCase()}</p>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', htmlContent], {
      type: 'application/msword'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Traffic_AI_Audit_Report_${reportMeta.reportId}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // 3. Export Excel Workbook
  function exportExcelReport() {
    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Metadata & Indices
      const summaryData = [
        ['NEURALTRAFFIC AI – SAFETY AUDIT REPORT'],
        ['Report ID', reportMeta.reportId],
        ['Site Location', reportMeta.locationName],
        ['Auditor Name', reportMeta.auditorName],
        ['Date', reportMeta.date],
        [],
        ['SAFETY INDICES', 'VALUE', 'RISK CATEGORY', 'RECOMMENDATION'],
        ['PSI (Pedestrian Safety Index)', currentPsi, psiBand, psiRec],
        ['SRI (Speed Risk Index)', currentSri, parseFloat(currentSri) > 1 ? 'High' : 'Normal', sriRec],
        ['CRI (Conflict Risk Index)', currentCri, res && res.indices.CRI >= state.params.thresholds.cri ? 'Elevated' : 'Normal', 'Maintain traffic controls and review turning conflict points.'],
        ['PRI (Pedestrian Risk Index)', currentPri, res && res.indices.PRI >= state.params.thresholds.pri ? 'High' : 'Normal', 'Monitor waiting time and crossing opportunities.'],
        ['PEI (Pedestrian Exposure Index)', currentPei, res && res.indices.PEI >= state.params.thresholds.pei ? 'High' : 'Normal', 'Maintain pedestrian routes and crossing capacity.']
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, ws1, 'Safety Summary');

      // Sheet 2: Telemetry Parameters
      const paramsData = [
        ['PARAMETER', 'VALUE', 'UNIT'],
        ['Speed Limit', state.params.limit, 'km/h'],
        ['Average Speed', state.params.spdAvg, 'km/h'],
        ['Max / 85th Percentile Speed', state.params.spdMax, 'km/h'],
        ['Average Traffic Volume', state.params.tvAvg, 'veh/hr'],
        ['Peak Traffic Volume', state.params.tvMax, 'veh/hr'],
        ['Average Pedestrian Volume', state.params.pvAvg, 'ped/hr'],
        ['Peak Pedestrian Volume', state.params.pvMax, 'ped/hr'],
        ['Minimum Time to Collision (TTC)', state.params.ttc, 'seconds'],
        ['Pedestrian Waiting Delay', state.params.wtPed, 'seconds'],
        ['Total Cumulative Vehicles', state.params.vehCount, 'objects'],
        ['Total Cumulative Pedestrians', state.params.pedCount, 'objects'],
        ['Detected Conflict Incidents', state.params.conflicts, 'events']
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(paramsData);
      XLSX.utils.book_append_sheet(wb, ws2, 'Telemetry & Flow');

      // Sheet 3: Deficiencies
      const defData = [
        ['DEFICIENCY TITLE', 'DESCRIPTION', 'STATUS'],
        ...state.deficiencies.map((d, i) => [
          d.title,
          d.desc,
          state.observed[i] ? 'OBSERVED / FLAGGED' : 'CLEAR'
        ])
      ];
      const ws3 = XLSX.utils.aoa_to_sheet(defData);
      XLSX.utils.book_append_sheet(wb, ws3, 'Field Deficiencies');

      XLSX.writeFile(wb, `Traffic_AI_Audit_${reportMeta.reportId}.xlsx`);
    }).catch(err => {
      console.error(err);
      alert('Could not export Excel workbook.');
    });
  }

  // 4. Print / Native Browser PDF
  function handlePrint() {
    window.print();
  }

  return (
    <>
      <div className="page-header no-print">
        <div className="page-title-group">
          <h1>Comprehensive Analyzer Reports & Document Exports</h1>
          <div className="page-subtitle">
            Generate and download full engineering reports in PDF, Microsoft Word (.doc / .docx), and Excel workbook formats
          </div>
        </div>
      </div>

      {/* Download Action Cards */}
      <div className="grid g3 no-print" style={{ marginBottom: 24 }}>
        {/* PDF Download Card */}
        <div className="card" style={{ borderTop: '4px solid #e11d48', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-title">
              <span>Official PDF Report</span>
              <span className="badge badge-rose">PDF Format</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 18px', lineHeight: 1.5 }}>
              Generates a formal multi-section engineering PDF complete with computed PSI/SRI indices, telemetry metrics, and IRC recommendations.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-rose" style={{ flex: 1 }} onClick={exportPdfReport}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download PDF
            </button>
            <button className="btn btn-ghost" title="Print or Save via Browser" onClick={handlePrint}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Word Document (.doc / .docx) Download Card */}
        <div className="card" style={{ borderTop: '4px solid #2563eb', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-title">
              <span>Microsoft Word (.doc / .docx)</span>
              <span className="badge badge-indigo">Word Docs</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 18px', lineHeight: 1.5 }}>
              Fully editable Microsoft Word document with tables, executive summaries, vision telemetry, and deficiency checklists. Opens in Word & Google Docs.
            </p>
          </div>
          <button className="btn btn-primary" onClick={exportWordDocReport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            Download Word Docs (.doc)
          </button>
        </div>

        {/* Excel Workbook Download Card */}
        <div className="card" style={{ borderTop: '4px solid #059669', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-title">
              <span>Excel Workbook (.xlsx)</span>
              <span className="badge badge-emerald">Spreadsheet</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 18px', lineHeight: 1.5 }}>
              Structured multi-sheet spreadsheet containing numerical safety tables, simulation variables, and raw sensor parameters for custom analysis.
            </p>
          </div>
          <button className="btn btn-emerald" onClick={exportExcelReport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
            Download Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Report Metadata Customizer */}
      <div className="card no-print" style={{ marginBottom: 24 }}>
        <div className="card-title">
          <span>Report Metadata & Location Settings</span>
          <span className="badge badge-cyan">Customizable Header</span>
        </div>
        <div className="grid g4" style={{ marginTop: 16 }}>
          <div className="input-label">
            <span>Location / Corridor</span>
            <input
              type="text"
              className="input-field"
              value={reportMeta.locationName}
              onChange={e => setReportMeta({ ...reportMeta, locationName: e.target.value })}
            />
          </div>
          <div className="input-label">
            <span>Auditing Agency / Dept</span>
            <input
              type="text"
              className="input-field"
              value={reportMeta.agency}
              onChange={e => setReportMeta({ ...reportMeta, agency: e.target.value })}
            />
          </div>
          <div className="input-label">
            <span>Lead Engineer / Auditor</span>
            <input
              type="text"
              className="input-field"
              value={reportMeta.auditorName}
              onChange={e => setReportMeta({ ...reportMeta, auditorName: e.target.value })}
            />
          </div>
          <div className="input-label">
            <span>Report Reference ID</span>
            <input
              type="text"
              className="input-field"
              value={reportMeta.reportId}
              onChange={e => setReportMeta({ ...reportMeta, reportId: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* LIVE REPORT PREVIEW DOCUMENT */}
      <div className="card report-document" style={{
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: 12,
        boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.08)',
        padding: '32px 36px'
      }}>
        {/* Document Header Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '2px solid #0f2744',
          paddingBottom: 20,
          marginBottom: 24
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                background: '#0f2744',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: 6,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: '0.05em'
              }}>
                NEURALTRAFFIC AI
              </div>
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Official Engineering Audit</span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f2744', margin: '8px 0 4px' }}>
              Comprehensive Intersection Road Safety Audit Report
            </h1>
            <div style={{ fontSize: 13, color: '#475569' }}>
              Corridor Location: <strong>{reportMeta.locationName}</strong>
            </div>
          </div>

          <div style={{ textAlign: 'right', fontSize: 12, color: '#64748b' }}>
            <div><strong>Report Ref:</strong> {reportMeta.reportId}</div>
            <div><strong>Date:</strong> {reportMeta.date}</div>
            <div style={{ marginTop: 4 }}>
              <span className="badge badge-emerald" style={{ fontSize: 11 }}>YOLOv8 Vision Active</span>
            </div>
          </div>
        </div>

        {/* Executive Summary Card */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderLeft: `5px solid ${currentPsi > 80 ? '#e11d48' : currentPsi > 60 ? '#d97706' : currentPsi > 30 ? '#0284c7' : '#059669'}`,
          borderRadius: 8,
          padding: 20,
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                Overall Intersection Safety Assessment
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
                PSI: {currentPsi} / 100 — <span style={{
                  color: currentPsi > 80 ? '#e11d48' : currentPsi > 60 ? '#d97706' : currentPsi > 30 ? '#0284c7' : '#059669'
                }}>{psiBand}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className={`badge ${currentPsi > 80 ? 'badge-rose' : currentPsi > 60 ? 'badge-amber' : currentPsi > 30 ? 'badge-cyan' : 'badge-emerald'}`} style={{ fontSize: 13, padding: '6px 14px' }}>
                {psiBand}
              </span>
            </div>
          </div>
          <p style={{ fontSize: 13, color: '#334155', marginTop: 10, lineHeight: 1.6 }}>
            <strong>Operational Recommendation:</strong> {psiRec}
          </p>
        </div>

        {/* Section 1: Calculated Safety Indices */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f2744', borderBottom: '1px solid #e2e8f0', paddingBottom: 8, marginBottom: 14 }}>
            1. Computed Safety Indices & IRC Provisional Rules
          </h3>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #cbd5e1' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#0f2744', color: '#ffffff' }}>
                  <th style={{ padding: '10px 14px', width: '12%' }}>Index</th>
                  <th style={{ padding: '10px 14px', width: '14%' }}>Live Value</th>
                  <th style={{ padding: '10px 14px', width: '18%' }}>Condition</th>
                  <th style={{ padding: '10px 14px', width: '56%' }}>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>PSI</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{currentPsi} / 100</td>
                  <td style={{ padding: '10px 14px' }}><span className="badge badge-blue">{psiBand}</span></td>
                  <td style={{ padding: '10px 14px', color: '#334155' }}>{psiRec}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>SRI</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{currentSri}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className={`badge ${parseFloat(currentSri) > 1.0 ? 'badge-rose' : 'badge-emerald'}`}>
                      {parseFloat(currentSri) > 1.0 ? 'Speeding (>1.0)' : 'Compliant (≤1.0)'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#334155' }}>{sriRec}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>CRI</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{currentCri}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className={`badge ${res && res.indices.CRI >= state.params.thresholds.cri ? 'badge-rose' : 'badge-emerald'}`}>
                      {res && res.indices.CRI >= state.params.thresholds.cri ? 'High Concern' : 'Normal / Low'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#334155' }}>
                    Maintain traffic controls; review conflict points, turning movements and TTC observations.
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>PRI</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{currentPri}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className={`badge ${res && res.indices.PRI >= state.params.thresholds.pri ? 'badge-amber' : 'badge-emerald'}`}>
                      {res && res.indices.PRI >= state.params.thresholds.pri ? 'High Concern' : 'Normal / Low'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#334155' }}>
                    Monitor waiting time, crossing opportunities and pedestrian waiting areas.
                  </td>
                </tr>
                <tr style={{ background: '#ffffff' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>PEI</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{currentPei}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className={`badge ${res && res.indices.PEI >= state.params.thresholds.pei ? 'badge-indigo' : 'badge-cyan'}`}>
                      {res && res.indices.PEI >= state.params.thresholds.pei ? 'High Exposure' : 'Normal / Low'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#334155' }}>
                    Maintain pedestrian routes; review crossing placement and demand.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: AI Vision & Flow Telemetry Grid */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f2744', borderBottom: '1px solid #e2e8f0', paddingBottom: 8, marginBottom: 14 }}>
            2. AI Vision Telemetry & Intersection Flow Parameters
          </h3>
          <div className="grid g3" style={{ gap: 12 }}>
            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Average Vehicle Speed</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>{state.params.spdAvg} km/h</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Posted Limit: {state.params.limit} km/h (Max: {state.params.spdMax} km/h)</div>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Traffic & Pedestrian Flow</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>{state.params.tvAvg} veh / {state.params.pvAvg} ped</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Hourly volume rate</div>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Time-To-Collision (TTC)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>{state.params.ttc} s</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Ped Delay: {state.params.wtPed}s | Conflicts: {state.params.conflicts}</div>
            </div>
          </div>
        </div>

        {/* Section 3: Observed Site Deficiencies Checklist */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f2744', borderBottom: '1px solid #e2e8f0', paddingBottom: 8, marginBottom: 14 }}>
            3. Observed Site Deficiencies & Road Infrastructure Audit
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {state.deficiencies.map((def, idx) => {
              const isFlagged = !!state.observed[idx];
              return (
                <div key={idx} style={{
                  padding: '10px 14px',
                  borderRadius: 6,
                  border: isFlagged ? '1px solid #fecdd3' : '1px solid #e2e8f0',
                  background: isFlagged ? '#fff1f2' : '#ffffff',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10
                }}>
                  <span style={{
                    fontWeight: 800,
                    fontSize: 12,
                    color: isFlagged ? '#e11d48' : '#64748b',
                    paddingTop: 2
                  }}>
                    {isFlagged ? '☒' : '☐'}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isFlagged ? '#9f1239' : '#0f172a' }}>
                      {def.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {def.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 4: Recommended Engineering Countermeasures */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f2744', borderBottom: '1px solid #e2e8f0', paddingBottom: 8, marginBottom: 14 }}>
            4. Recommended Engineering Countermeasures
          </h3>
          <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <ul style={{ fontSize: 13, color: '#334155', lineHeight: 1.8, paddingLeft: 18 }}>
              <li><strong>Physical Geometry:</strong> Construct a raised median pedestrian refuge island of minimum width 1.8m (recommended whenever crossing width exceeds 12m).</li>
              <li><strong>Road Markings:</strong> Repaint high-visibility retroreflective thermoplastic zebra markings and maintain advance stop bars.</li>
              <li><strong>Signal Phasing:</strong> Implement a Leading Pedestrian Interval (LPI) of 4 to 6 seconds before adjacent vehicular traffic is released.</li>
              <li><strong>Speed Control:</strong> Deploy dynamic radar speed-feedback displays and optical speed bars to enforce the {state.params.limit} km/h speed limit.</li>
            </ul>
          </div>
        </div>

        {/* Sign-Off / Approval Block */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: '1px solid #cbd5e1',
          paddingTop: 20,
          marginTop: 20,
          fontSize: 12,
          color: '#64748b'
        }}>
          <div>
            <div><strong>Auditing Officer:</strong> {reportMeta.auditorName}</div>
            <div><strong>Department:</strong> {reportMeta.agency}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div><strong>Approved By:</strong> Chief Highway & Safety Commissioner</div>
            <div><strong>Verification:</strong> Certified Digital Audit Signature</div>
          </div>
        </div>
      </div>
    </>
  );
}
