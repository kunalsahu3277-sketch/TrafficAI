import { useState, useEffect, useCallback } from 'react';
import { AppProvider, useAppState } from './context/AppContext';
import { checkHealth, API_BASE } from './services/api';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import YoloStudio from './pages/YoloStudio';
import Geometry from './pages/Geometry';
import Heatmap from './pages/Heatmap';
import Safety from './pages/Safety';
import Problems from './pages/Problems';
import Countermeasures from './pages/Countermeasures';
import Reports from './pages/Reports';

function AppContent() {
  const [currentTab, setCurrentTab] = useState('dash');
  const [waking, setWaking] = useState(false);
  const { state, dispatch } = useAppState();

  const pingServer = useCallback(async () => {
    try {
      setWaking(true);
      const data = await checkHealth();
      setWaking(false);
      dispatch({
        type: 'SET_SERVER_STATUS',
        payload: { status: 'online', latency: data.latencyMs, classes: data.classes }
      });
    } catch {
      setWaking(false);
      dispatch({ type: 'SET_SERVER_STATUS', payload: { status: 'offline', latency: null } });
    }
  }, [dispatch]);

  useEffect(() => {
    pingServer();
    // Re-check frequently (8s) if offline so recovery is fast; every 30s when stable
    const delay = state.serverStatus === 'online' ? 30000 : 8000;
    const timer = setTimeout(pingServer, delay);
    return () => clearTimeout(timer);
  }, [pingServer, state.serverStatus]);

  const navigateTo = useCallback((tab) => {
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const renderPage = () => {
    switch (currentTab) {
      case 'dash': return <Dashboard onNavigate={navigateTo} />;
      case 'ai': return <YoloStudio />;
      case 'geometry': return <Geometry />;
      case 'spatial': return <Heatmap />;
      case 'safety': return <Safety />;
      case 'problems': return <Problems />;
      case 'countermeasures': return <Countermeasures />;
      case 'reports': return <Reports />;
      default: return <Dashboard onNavigate={navigateTo} />;
    }
  };

  return (
    <>
      <Header onNavigate={navigateTo} onPing={pingServer} />

      {/* Cold-Start / Waking Banner */}
      {waking && state.serverStatus !== 'online' && (
        <div style={{
          background: 'linear-gradient(90deg,#1e3a8a,#1e40af)',
          color: '#ffffff',
          fontSize: 13,
          fontWeight: 600,
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          Waking up backend server on Render (free tier cold-start, please wait 20–30 s)…
          <span style={{ opacity: 0.7, fontWeight: 400, fontSize: 12 }}>{API_BASE}</span>
        </div>
      )}

      <div className="app-layout">
        <Sidebar currentTab={currentTab} onNavigate={navigateTo} />
        <main className="content-area">
          {renderPage()}
        </main>
      </div>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
