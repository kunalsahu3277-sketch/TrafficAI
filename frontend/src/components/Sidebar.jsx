const navItems = [
  { section: 'Telemetry & Vision', items: [
    { tab: 'dash', label: 'Dashboard', icon: <><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></> },
    { tab: 'ai', label: 'YOLO Vision Studio', icon: <><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></>, badge: 'AI Live' },
  ]},
  { section: 'Safety & Geometry', items: [
    { tab: 'geometry', label: 'Intersection Geometry', icon: <><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></> },
    { tab: 'spatial', label: 'Conflict Heatmap', icon: <><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></> },
    { tab: 'safety', label: 'Safety Indices (PSI)', icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/> },
  ]},
  { section: 'Audit & Interventions', items: [
    { tab: 'problems', label: 'Site Deficiencies', icon: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></> },
    { tab: 'countermeasures', label: 'Countermeasures', icon: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/> },
    { tab: 'reports', label: 'Reports & Export', icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></> },
  ]},
];

export default function Sidebar({ currentTab, onNavigate }) {
  return (
    <aside className="sidebar">
      {navItems.map((section, si) => (
        <div key={si}>
          <div className="nav-section-title">{section.section}</div>
          {section.items.map(item => (
            <a
              key={item.tab}
              className={`nav-item ${currentTab === item.tab ? 'active' : ''}`}
              data-tab={item.tab}
              onClick={() => onNavigate(item.tab)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                {item.icon}
              </svg>
              {item.label}
              {item.badge && <span className="nav-badge">{item.badge}</span>}
            </a>
          ))}
        </div>
      ))}
    </aside>
  );
}
