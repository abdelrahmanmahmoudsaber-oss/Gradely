import React from 'react';
import { LogOut, Bell } from 'lucide-react';
import Avatar from '../components/common/Avatar';

export default function DashboardLayout({
  user,
  sidebarTitle = 'Gradely',
  sidebarSubtitle = 'Portal',
  navItems = [],
  activePage,
  onPageChange,
  onLogout,
  children
}) {
  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>{sidebarTitle}</h2>
          <span>{sidebarSubtitle}</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activePage === item.value;
            return (
              <button
                key={idx}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => onPageChange(item.value)}
              >
                <span className="nav-icon"><Icon size={18} /></span> {item.label}
              </button>
            );
          })}

          {/* Sidebar Sign Out button at the bottom */}
          <button 
            className="nav-item" 
            onClick={onLogout} 
            style={{ marginTop: 'auto', color: '#ef4444', fontWeight: 600 }}
          >
            <span className="nav-icon"><LogOut size={18} /></span> Sign Out
          </button>
        </nav>
        <div className="sidebar-footer">
          <Avatar username={user.username} name={user.name} />
          <div className="user-info">
            <h4>{user.name}</h4>
            <p>{user.role === 'ta' ? 'Instructor' : `ID: #${user.username}`}</p>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="main-content">
        {/* TOPBAR */}
        <div className="topbar">
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            Welcome Back!
          </div>
          <div className="topbar-actions">
            <button className="topbar-icon-btn"><Bell size={20} /></button>
          </div>
        </div>

        {/* PAGE CONTENT CONTAINER */}
        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  );
}
