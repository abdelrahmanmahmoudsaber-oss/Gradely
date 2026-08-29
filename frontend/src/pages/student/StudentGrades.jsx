import React from 'react';

export default function StudentGrades({ student }) {
  const getGradeLetter = (score, maxScore) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return { letter: 'A', cls: 'grade-a' };
    if (percentage >= 80) return { letter: 'B', cls: 'grade-b' };
    if (percentage >= 70) return { letter: 'C', cls: 'grade-c' };
    if (percentage >= 60) return { letter: 'D', cls: 'grade-d' };
    return { letter: 'F', cls: 'grade-f' };
  };

  return (
    <>
      <div className="page-header">
        <h1>My Course Grades</h1>
        <p>Detailed verification ledger of your academic marks.</p>
      </div>

      <div className="table-card">
        {student.grades.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Score</th>
                <th>Max</th>
                <th>Grade</th>
                <th>Absent Sections (out of 10)</th>
              </tr>
            </thead>
            <tbody>
              {student.grades.map((g, idx) => {
                const gr = getGradeLetter(g.score, g.maxScore);
                const absentSections = Array.isArray(g.absences) ? [...g.absences].sort((a,b)=>a-b) : [];
                const isAtRisk = absentSections.length > 3;
                return (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{g.subject}</td>
                    <td style={{ fontWeight: 700 }}>{g.score}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{g.maxScore}</td>
                    <td><span className={`grade-badge ${gr.cls}`}>{gr.letter}</span></td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {/* Visual section grid 1-10 */}
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          {[1,2,3,4,5,6,7,8,9,10].map(sec => {
                            const absent = absentSections.includes(sec);
                            return (
                              <div 
                                key={sec} 
                                style={{
                                  width: '26px', height: '26px', borderRadius: '6px',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '0.7rem', fontWeight: 700,
                                  background: absent
                                    ? (isAtRisk ? 'var(--danger-bg)' : 'var(--warning-bg)')
                                    : 'rgba(16,185,129,0.08)',
                                  color: absent
                                    ? (isAtRisk ? 'var(--danger)' : 'var(--warning)')
                                    : 'var(--success)',
                                  border: `1.5px solid ${absent ? (isAtRisk ? 'var(--danger)' : 'var(--warning)') : 'rgba(16,185,129,0.25)'}`
                                }}
                              >
                                S{sec}
                              </div>
                            );
                          })}
                        </div>
                        {/* Summary text */}
                        <div style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {absentSections.length === 0 ? (
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ No Absences — Perfect Attendance!</span>
                          ) : (
                            <span style={{ color: isAtRisk ? 'var(--danger)' : 'var(--warning)', fontWeight: 600 }}>
                              {isAtRisk ? '⚠️' : '•'} Absent {absentSections.length}/10 sections
                              {isAtRisk && ' — Risk of failing attendance!'}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>No course grade records posted to your profile yet.</p>
          </div>
        )}
      </div>
    </>
  );
}
