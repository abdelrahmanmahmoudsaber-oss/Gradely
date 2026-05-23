import React from 'react';
import { Calendar, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import StatsGrid, { StatCard } from '../../components/common/StatsGrid';

export default function StudentAttendance({ student }) {
  // Calculate global metrics
  const totalCourses = student.grades.length;
  let totalPossibleSections = totalCourses * 10;
  let totalAbsences = 0;

  student.grades.forEach(g => {
    const absences = Array.isArray(g.absences) ? g.absences.length : 0;
    totalAbsences += absences;
  });

  const totalPresence = totalPossibleSections - totalAbsences;
  const overallRate = totalPossibleSections > 0 
    ? Math.round((totalPresence / totalPossibleSections) * 100) 
    : 100;

  // Determine risk profile
  let riskLevel = 'Safe';
  let riskColor = 'var(--success)';
  let riskBg = 'rgba(16, 185, 129, 0.1)';

  const coursesAtRisk = student.grades.filter(g => Array.isArray(g.absences) && g.absences.length > 3);
  if (coursesAtRisk.length > 0) {
    riskLevel = 'At Risk';
    riskColor = 'var(--danger)';
    riskBg = 'rgba(239, 68, 68, 0.1)';
  } else if (totalAbsences > 0) {
    riskLevel = 'Warning';
    riskColor = 'var(--warning)';
    riskBg = 'rgba(245, 158, 11, 0.1)';
  }

  return (
    <>
      <div className="page-header">
        <h1>Course Attendance Ledger</h1>
        <p>Comprehensive track-record of your section presence, absence indices, and eligibility standing.</p>
      </div>

      <StatsGrid>
        <StatCard
          label="Overall Attendance Rate"
          value={`${overallRate}%`}
          icon={CheckCircle}
          variant={overallRate >= 90 ? 'green' : overallRate >= 75 ? 'blue' : 'amber'}
        />
        <StatCard
          label="Total Absences"
          value={`${totalAbsences} Sections`}
          icon={Clock}
          variant={totalAbsences === 0 ? 'green' : 'amber'}
        />
        <StatCard
          label="Academic Standing"
          value={riskLevel}
          icon={AlertTriangle}
          variant={riskLevel === 'Safe' ? 'green' : riskLevel === 'Warning' ? 'amber' : 'red'}
          valueStyle={{ 
            fontSize: '1.25rem', 
            color: riskColor,
            background: riskBg,
            padding: '0.2rem 0.6rem',
            borderRadius: '8px',
            display: 'inline-block',
            marginTop: '0.25rem'
          }}
        />
      </StatsGrid>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
        {student.grades.map((g, idx) => {
          const absentSections = Array.isArray(g.absences) ? [...g.absences].sort((a,b)=>a-b) : [];
          const missedCount = absentSections.length;
          const presentCount = 10 - missedCount;
          const courseRate = presentCount * 10;
          const isAtRisk = missedCount > 3;

          return (
            <div 
              key={idx} 
              className="content-card"
              style={{ 
                padding: '1.5rem',
                borderLeft: `5px solid ${isAtRisk ? 'var(--danger)' : 'var(--success)'}`,
                boxShadow: 'var(--shadow-md)',
                background: 'var(--card-bg)',
                borderRadius: '16px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{g.subject}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <Calendar size={14} />
                    <span>10 Sections Scheduled per Semester</span>
                  </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: isAtRisk ? 'var(--danger)' : 'var(--success)' }}>
                    {courseRate}%
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {presentCount} / 10 Present
                  </div>
                </div>
              </div>

              {/* Attendance Timeline Visualizer */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', fontWeight: 700 }}>
                  Weekly Section Presence Matrix
                </h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(68px, 1fr))', gap: '0.5rem' }}>
                  {[1,2,3,4,5,6,7,8,9,10].map(sec => {
                    const isAbsent = absentSections.includes(sec);
                    return (
                      <div 
                        key={sec}
                        style={{
                          background: isAbsent 
                            ? 'rgba(239, 68, 68, 0.08)' 
                            : 'rgba(16, 185, 129, 0.08)',
                          border: `1.5px solid ${isAbsent ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`,
                          borderRadius: '12px',
                          padding: '0.75rem 0.5rem',
                          textAlign: 'center',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                          Sec {sec}
                        </div>
                        <div style={{ 
                          fontSize: '0.8rem', 
                          fontWeight: 800, 
                          color: isAbsent ? 'var(--danger)' : 'var(--success)'
                        }}>
                          {isAbsent ? 'ABSENT' : 'PRESENT'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Alert Ribbon if at risk */}
              {isAtRisk ? (
                <div 
                  className="alert alert-danger" 
                  style={{ 
                    margin: 0, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem', 
                    borderRadius: '12px',
                    border: '1.5px solid rgba(239, 68, 68, 0.3)'
                  }}
                >
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    <strong>CRITICAL ATTENDANCE RISK:</strong> You have accumulated {missedCount} absences in this subject. Course guidelines specify a maximum limit of 3 absences. Please consult your course instructor or Teaching Assistant immediately to prevent potential academic suspension.
                  </div>
                </div>
              ) : missedCount > 0 ? (
                <div 
                  className="alert alert-warning" 
                  style={{ 
                    margin: 0, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem', 
                    borderRadius: '12px',
                    border: '1.5px solid rgba(245, 158, 11, 0.3)'
                  }}
                >
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    <strong>Absence Advisory:</strong> You were recorded absent for Section{missedCount > 1 ? 's' : ''} {absentSections.join(', ')}. Try to attend all remaining sessions to avoid academic penalties.
                  </div>
                </div>
              ) : (
                <div 
                  className="alert alert-success" 
                  style={{ 
                    margin: 0, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem', 
                    borderRadius: '12px',
                    border: '1.5px solid rgba(16, 185, 129, 0.3)',
                    background: 'rgba(16, 185, 129, 0.04)',
                    color: 'var(--success)'
                  }}
                >
                  <CheckCircle size={18} style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    <strong>Perfect Standing:</strong> Exceptional work! You have attended every scheduled academic session for this subject. Keep up the high standard.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
