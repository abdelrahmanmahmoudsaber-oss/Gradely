import React from 'react';

export function StatCard({ label, value, icon: Icon, variant = 'blue', valueStyle = {} }) {
  const iconClass = `stat-icon-${variant}`;
  return (
    <div className="stat-card">
      <div className="stat-info">
        <label>{label}</label>
        <div className="stat-value" style={valueStyle}>{value}</div>
      </div>
      <div className={`stat-icon ${iconClass}`}>
        <Icon size={24} />
      </div>
    </div>
  );
}

export default function StatsGrid({ children }) {
  return (
    <div className="stats-grid">
      {children}
    </div>
  );
}
