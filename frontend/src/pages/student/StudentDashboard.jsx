import React from 'react';
import { BookOpen, Sparkles, GraduationCap, CheckCircle, ShieldCheck } from 'lucide-react';
import StatsGrid, { StatCard } from '../../components/common/StatsGrid';

export default function StudentDashboard({ student }) {
  return (
    <>
      <div className="page-header">
        <h1>Welcome, {student.name}! 👋</h1>
        <p>Access your personalized student grade dashboard and review visual insights.</p>
      </div>

      <StatsGrid>
        <StatCard
          label="Enrolled Courses"
          value={student.grades.length}
          icon={BookOpen}
          variant="blue"
        />
        <StatCard
          label="Academic Status"
          value="Good Standing"
          icon={Sparkles}
          variant="green"
          valueStyle={{ fontSize: '1.25rem', color: 'var(--success)' }}
        />
        <StatCard
          label="Class Standing"
          value="Active Student"
          icon={GraduationCap}
          variant="amber"
          valueStyle={{ fontSize: '1.25rem', color: 'var(--info)' }}
        />
      </StatsGrid>

      <div className="content-card">
        <h3>Latest Academic Activity</h3>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
            <div className="stat-icon stat-icon-green" style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>All Grades Verified</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Updated live by course instructor</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0' }}>
            <div className="stat-icon stat-icon-blue" style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Academic Portal Online</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Secure LTR Grade Access Enabled</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
