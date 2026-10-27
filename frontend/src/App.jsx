import { useState, useEffect, useCallback } from 'react';
import { AppProvider, useAppState } from './context/AppContext';
import { checkHealth } from './services/api';
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
  const { state, dispatch } = useAppState();

  const pingServer = useCallback(async () => {
    try {
      const data = await checkHealth();
      dispatch({
        type: 'SET_SERVER_STATUS',
        payload: { status: 'online', latency: data.latencyMs, classes: data.classes }
      });
    } catch {
      dispatch({ type: 'SET_SERVER_STATUS', payload: { status: 'offline', latency: null } });
    }
  }, [dispatch]);

  useEffect(() => {
    pingServer();
    const interval = setInterval(pingServer, 10000);
    return () => clearInterval(interval);
  }, [pingServer]);

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
