import { createContext, useContext, useReducer } from 'react';

// Default application state
const defaultState = {
  serverStatus: 'checking', // 'checking' | 'online' | 'offline'
  serverLatency: null,
  serverClasses: ['Bike', 'Car', 'Person', 'Truck'],
  
  ai: {
    kind: 'image',
    file: null,
    fileUrl: '',
    annotatedVideoUrl: '',
    videoViewMode: 'annotated',
    sourceImg: null,
    confidence: 25,
    running: false,
    analyzed: false,
    error: '',
    detections: [],
    videoResult: null,
    lastInferenceTime: null,
  },

  params: {
    win: 60, mpp: 0.05, limit: 30, basis: 'avg',
    spdAvg: 31.8, spdMax: 42.0,
    tvAvg: 406, tvMax: 480,
    pvAvg: 214, pvMax: 260,
    ttc: 2.9, wtPed: 18.6, wtVeh: 24.3,
    ttcN: 0.3, wtN: 0.3,
    pedCount: 1284, pedAvgV: 1.24, pedMaxV: 2.06,
    vehCount: 2436, queue: 18.4, conflicts: 37,
    weights: { ttc: 0.5028, vs: 0.2562, tv: 0.1394, pv: 0.0670, wt: 0.0348 },
    thresholds: { cri: 4000, pri: 1500, pei: 100000, ttc: 3.0, tv1: 150, tv2: 300, tv3: 450, pv1: 100, pv2: 200, pv3: 300 }
  },

  composition: [
    { name: 'Cars', color: '#3b82f6', percent: 45 },
    { name: 'Bikes / 2W', color: '#06b6d4', percent: 32 },
    { name: 'Trucks', color: '#8b5cf6', percent: 14 },
    { name: 'Buses', color: '#f59e0b', percent: 6 },
    { name: 'Other', color: '#64748b', percent: 3 }
  ],

  heatmap: [
    0.15, 0.35, 0.55, 0.30, 0.10,
    0.20, 0.45, 0.85, 0.65, 0.25,
    0.30, 0.65, 0.95, 0.55, 0.30,
    0.25, 0.50, 0.70, 0.40, 0.20,
    0.10, 0.25, 0.35, 0.20, 0.10
  ],

  deficiencies: [
    { title: "Faded or missing pavement markings", desc: "Inspect and renew stop lines, lane separators, and zebra crossings." },
    { title: "Missing or obscured regulatory signs", desc: "Verify speed limit signs, stop signs, and pedestrian warning signs." },
    { title: "Obstructed pedestrian desire line", desc: "Remove barriers, utility posts, or informal parking on walkways." },
    { title: "Deficient sight distance at approach", desc: "Check vegetation, parked heavy vehicles, and sight triangles." },
    { title: "Excessive vehicular approach speeds", desc: "Speeds consistently 25%+ above posted intersection limit." },
    { title: "Inadequate crossing facility / refuge", desc: "Roadway width > 12m without pedestrian refuge island." },
    { title: "Excessive pedestrian delay (> 30s)", desc: "Long cycle times causing unsafe mid-block crossing attempts." },
    { title: "High turning conflict density", desc: "Free-left turns conflicting with green pedestrian phase." }
  ],

  observed: {}
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_SERVER_STATUS':
      return { ...state, serverStatus: action.payload.status, serverLatency: action.payload.latency, serverClasses: action.payload.classes || state.serverClasses };
    case 'SET_AI':
      return { ...state, ai: { ...state.ai, ...action.payload } };
    case 'SET_PARAM':
      return { ...state, params: { ...state.params, [action.key]: action.value } };
    case 'SET_PARAMS':
      return { ...state, params: { ...state.params, ...action.payload } };
    case 'SET_COMPOSITION':
      return { ...state, composition: action.payload };
    case 'TOGGLE_OBSERVED':
      return { ...state, observed: { ...state.observed, [action.idx]: !state.observed[action.idx] } };
    default:
      return state;
  }
}

const AppContext = createContext();

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, defaultState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppContext);
}
