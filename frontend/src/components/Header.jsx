import { useAppState } from '../context/AppContext';

export default function Header({ onNavigate, onPing }) {
  const { state } = useAppState();
  const { serverStatus, serverLatency } = state;

  const dotClass = serverStatus === 'online' ? 'online' : serverStatus === 'offline' ? 'offline' : 'checking';
  const statusText = serverStatus === 'online'
    ? `YOLOv8 Engine Online (${serverLatency}ms)`
    : serverStatus === 'offline'
      ? 'YOLO Backend Offline (Click to connect)'
      : 'Connecting to YOLO Backend...';

  return (
    <header>
      <div className="brand-wrapper" onClick={() => onNavigate('dash')}>
        <div className="brand-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <div>
          <div className="brand-title">TRAFFIC<span>AI</span></div>
        </div>
        <div className="brand-badge">YOLOv8 Vision</div>
      </div>

      <div className="header-actions">
        <div className="server-status-pill" onClick={onPing} title="Click to test connection">
          <div className={`status-dot ${dotClass}`}></div>
          <span>{statusText}</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => onNavigate('ai')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
          </svg>
          Test Sample Image
        </button>
      </div>
    </header>
  );
}
