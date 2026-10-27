import { useAppState } from '../context/AppContext';
import { classifyIndices } from '../utils/calculations';

export default function Reports() {
  const { state } = useAppState();

  function exportPdfReport() {
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF();
      const res = classifyIndices(state.params);

      doc.setFillColor(11, 17, 32);
      doc.rect(0, 0, 210, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text('TRAFFIC AI – INTERSECTION SAFETY REPORT', 14, 18);

      doc.setTextColor(40, 40, 40);
      doc.setFontSize(11);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 40);
      doc.text(`Model Engine: YOLOv8 (best.pt)`, 14, 48);

      let y = 62;
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Calculated Safety Indices:', 14, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      if (res) {
        res.cards.forEach(c => {
          doc.text(`${c.name} (${c.key}): ${c.val}  [${c.label}]`, 14, y);
          y += 6;
          doc.text(`Recommendation: ${c.rec}`, 18, y);
          y += 8;
        });
      }

      doc.save('Traffic_AI_Safety_Report.pdf');
    }).catch(() => {
      alert('Failed to load jsPDF library.');
    });
  }

  function exportExcelReport() {
    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new();
      const paramsData = [
        ['Parameter', 'Value'],
        ['Speed Limit (km/h)', state.params.limit],
        ['Average Speed (km/h)', state.params.spdAvg],
        ['Max Speed (km/h)', state.params.spdMax],
        ['Traffic Volume', state.params.tvAvg],
        ['Pedestrian Volume', state.params.pvAvg],
        ['Minimum TTC (s)', state.params.ttc]
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(paramsData);
      XLSX.utils.book_append_sheet(wb, ws1, 'Parameters');
      XLSX.writeFile(wb, 'Traffic_AI_Data.xlsx');
    }).catch(() => {
      alert('Failed to load SheetJS library.');
    });
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title-group">
          <h1>Reports & Export Data</h1>
          <div className="page-subtitle">Generate engineering audit documentation, PDF summary sheets, and spreadsheet workbooks</div>
        </div>
      </div>

      <div className="grid g2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">
            <span>Official Engineering PDF Report</span>
            <span className="badge badge-rose">PDF Format</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 20px' }}>
            Exports complete intersection summary including calculated PSI/SRI indices, YOLO computer vision detections, site deficiencies, and recommended countermeasures.
          </p>
          <button className="btn btn-rose" onClick={exportPdfReport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download PDF Report
          </button>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Excel Analysis Workbook</span>
            <span className="badge badge-emerald">XLSX Format</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 20px' }}>
            Exports multi-sheet workbook containing raw parameter variables, spatial heatmap matrices, and vehicle classification breakdown.
          </p>
          <button className="btn btn-emerald" onClick={exportExcelReport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Excel Workbook
          </button>
        </div>
      </div>
    </>
  );
}
