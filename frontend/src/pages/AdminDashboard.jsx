import { useState } from 'react';
import { LogOut, BookOpen, Users, CheckSquare, FileText, LayoutDashboard, Menu, X, Printer } from 'lucide-react';
import OverviewTab from '../components/admin/OverviewTab';
import SubjectsTab from '../components/admin/SubjectsTab';
import StudentsTab from '../components/admin/StudentsTab';
import AttendanceTab from '../components/admin/AttendanceTab';
import GradesTab from '../components/admin/GradesTab';
import StudentReportTab from '../components/admin/StudentReportTab';

export default function AdminDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isSuperAdmin = !user || user.user_id === 'admin';

  const getPageTitle = () => {
    switch(activeTab) {
      case 'overview': return 'نظرة عامة';
      case 'subjects': return 'إدارة المواد';
      case 'students': return 'إدارة المستخدمين';
      case 'attendance': return 'سجل الغياب';
      case 'grades': return 'الدرجات التفصيلية';
      case 'report': return 'تقرير الطالب الشامل';
      default: return '';
    }
  };

  const allNavItems = [
    { id: 'overview', label: 'نظرة عامة', icon: <LayoutDashboard size={20} />, superOnly: false },
    { id: 'subjects', label: 'إدارة المواد', icon: <BookOpen size={20} />, superOnly: true },
    { id: 'students', label: 'إدارة المستخدمين', icon: <Users size={20} />, superOnly: true },
    { id: 'attendance', label: 'سجل الغياب', icon: <CheckSquare size={20} />, superOnly: false },
    { id: 'grades', label: 'الدرجات التفصيلية', icon: <FileText size={20} />, superOnly: false },
    { id: 'report', label: 'تقرير طالب شامل', icon: <Printer size={20} />, superOnly: false },
  ];

  const navItems = allNavItems.filter(item => isSuperAdmin || !item.superOnly);

  return (
    <div style={{display: 'flex', minHeight: '100vh', width: '100%', position: 'relative', overflowX: 'hidden'}}>
      
      {/* Mobile Menu Backdrop */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(3px)',
            zIndex: 90
          }}
          className="fade-in"
        />
      )}

      {/* Sidebar Drawer */}
      <div 
        style={{
          width: '280px', 
          maxWidth: '85vw',
          background: 'var(--surface)', 
          borderLeft: '1px solid var(--border)', 
          display: 'flex', 
          flexDirection: 'column',
          position: mobileMenuOpen ? 'fixed' : 'sticky',
          top: 0,
          right: 0,
          height: '100vh',
          zIndex: 100,
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: mobileMenuOpen ? '-10px 0 30px rgba(0,0,0,0.5)' : 'none'
        }}
        className={mobileMenuOpen ? '' : 'hide-on-mobile'}
      >
        <div style={{padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)'}}>
          <div>
            <h2 style={{margin: 0, color: 'var(--primary-hover)', fontSize: '1.8rem', fontWeight: 800, letterSpacing: '0.5px'}}>Gradely</h2>
            <span style={{fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginTop: '2px'}}>
              {isSuperAdmin ? 'بوابة الإدارة الأكاديمية' : 'بوابة المعيد والمشرف'}
            </span>
          </div>
          <button 
            style={{background:'rgba(255,255,255,0.05)', padding:'6px', color:'var(--text-main)', border:'none', borderRadius:'50%', cursor:'pointer', display: 'flex'}}
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={22} />
          </button>
        </div>

        <div style={{padding: '1.2rem 1.5rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)'}}>
            <div style={{width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(79, 70, 229, 0.25)', color: 'var(--primary-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem'}}>
              {(user?.name || user?.user_id || 'U').charAt(0)}
            </div>
            <div style={{minWidth: 0}}>
              <div style={{fontWeight: 800, fontSize: '0.95rem', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{user?.name || user?.user_id || 'المسؤول'}</div>
              <div style={{fontSize: '0.8rem', fontWeight: 700, marginTop: '2px', color: isSuperAdmin ? 'var(--success)' : '#60a5fa'}}>
                {isSuperAdmin ? 'مدير النظام' : 'معيد / مشرف'}
              </div>
            </div>
          </div>
        </div>

        <nav style={{padding: '0 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, overflowY: 'auto'}}>
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button 
                key={item.id}
                onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                style={{
                  background: isActive ? 'rgba(79, 70, 229, 0.2)' : 'transparent',
                  color: isActive ? '#ffffff' : '#cbd5e1',
                  border: 'none',
                  borderRight: isActive ? '4px solid var(--primary-hover)' : '4px solid transparent',
                  borderRadius: '0 8px 8px 0',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '1rem',
                  fontWeight: 700,
                  fontFamily: "'Cairo', sans-serif",
                  cursor: 'pointer',
                  textAlign: 'right',
                  transition: 'all 0.15s ease',
                  width: '100%'
                }}
              >
                <span style={{color: isActive ? 'var(--primary-hover)' : '#94a3b8', display: 'flex', alignItems: 'center'}}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={{padding: '1.2rem', borderTop: '1px solid var(--border)'}}>
          <button 
            onClick={onLogout}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '10px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <LogOut size={16} />
            تسجيل الخروج
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%'}}>
        
        {/* Top Navbar */}
        <header style={{
          height: '65px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 clamp(1rem, 3vw, 2rem)',
          position: 'sticky',
          top: 0,
          zIndex: 40
        }}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.8rem'}}>
            <button 
              className="show-on-mobile"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border)',
                color: 'var(--text-main)',
                padding: '8px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onClick={() => setMobileMenuOpen(true)}
              aria-label="فتح القائمة"
            >
              <Menu size={22} />
            </button>
            <h1 style={{margin: 0, fontSize: 'clamp(1.2rem, 3vw, 1.5rem)', fontWeight: 800}}>{getPageTitle()}</h1>
          </div>
        </header>

        {/* Dynamic View Component */}
        <main style={{padding: 'clamp(1rem, 2.5vw, 2rem)', flex: 1, overflowY: 'auto', width: '100%', boxSizing: 'border-box'}}>
          {activeTab === 'overview' && <OverviewTab user={user} />}
          {activeTab === 'subjects' && isSuperAdmin && <SubjectsTab user={user} />}
          {activeTab === 'students' && isSuperAdmin && <StudentsTab user={user} />}
          {activeTab === 'attendance' && <AttendanceTab user={user} />}
          {activeTab === 'grades' && <GradesTab user={user} />}
          {activeTab === 'report' && <StudentReportTab user={user} />}
        </main>
      </div>

    </div>
  );
}
