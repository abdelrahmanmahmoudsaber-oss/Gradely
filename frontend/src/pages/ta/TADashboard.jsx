import React from 'react';
import { Users, BookOpen, Sparkles } from 'lucide-react';
import StatsGrid, { StatCard } from '../../components/common/StatsGrid';
import Avatar from '../../components/common/Avatar';

export default function TADashboard({ user, students }) {
  const totalGrades = students.reduce((a, s) => a + s.grades.length, 0);

  return (
    <>
      <div className="page-header">
        <h1>Welcome back, {user.name} 👋</h1>
        <p>Here is an overview of your academic records workspace today.</p>
      </div>

      <StatsGrid>
        <StatCard 
          label="Enrolled Students" 
          value={students.length} 
          icon={Users} 
          variant="blue" 
        />
        <StatCard 
          label="Total Grades Posted" 
          value={totalGrades} 
          icon={BookOpen} 
          variant="green" 
        />
        <StatCard 
          label="Academic Status" 
          value="Active" 
          icon={Sparkles} 
          variant="amber" 
          valueStyle={{ fontSize: '1.25rem', color: 'var(--success)' }}
        />
      </StatsGrid>

      <div className="content-card">
        <h3>Recently Added Students</h3>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {students.length > 0 ? (
            students.slice(0, 3).map(s => (
              <div 
                key={s.studentId} 
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '0.75rem', 
                  padding: '0.75rem 0', borderBottom: '1px solid var(--border)' 
                }}
              >
                <Avatar username={s.studentId} name={s.name} size="sm" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{s.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ID: #{s.studentId}</div>
                </div>
                <span className="status-badge status-active">Registered</span>
              </div>
            ))
          ) : (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No students registered yet.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
