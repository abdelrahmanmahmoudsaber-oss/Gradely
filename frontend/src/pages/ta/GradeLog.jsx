import React, { useState } from 'react';
import { Search } from 'lucide-react';
import Avatar from '../../components/common/Avatar';

export default function GradeLog({ students }) {
  const [filter, setFilter] = useState('');

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(filter.toLowerCase()) ||
    s.studentId.includes(filter) ||
    s.grades.some(g => g.subject.toLowerCase().includes(filter.toLowerCase()))
  );

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
        <h1>Grade Log Listing</h1>
        <p>Unified visual inspection table of all recorded course grades.</p>
      </div>

      <div className="table-card">
        <div className="table-toolbar">
          <div className="table-search">
            <span className="search-icon"><Search size={18} /></span>
            <input
              placeholder="Filter by student or course..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
        </div>

        {filtered.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Subject</th>
                <th>Score</th>
                <th>Max Score</th>
                <th>Absences (/10)</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {filtered.flatMap(s =>
                s.grades.length > 0 ? (
                  s.grades.map((g, idx) => {
                    const gr = getGradeLetter(g.score, g.maxScore);
                    const absentSections = Array.isArray(g.absences) ? [...g.absences].sort((a, b) => a - b) : [];
                    return (
                      <tr key={`${s.studentId}-${idx}`}>
                        {idx === 0 ? (
                          <td 
                            rowSpan={s.grades.length} 
                            style={{ fontWeight: 600, verticalAlign: 'top', paddingTop: '1.2rem' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <Avatar username={s.studentId} name={s.name} size="sm" />
                              {s.name}
                            </div>
                          </td>
                        ) : null}
                        <td style={{ fontWeight: 600 }}>{g.subject}</td>
                        <td style={{ fontWeight: 700 }}>{g.score}</td>
                        <td>{g.maxScore}</td>
                        <td>
                          {absentSections.length === 0 ? (
                            <span style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600 }}>✓ No Absences</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
                              {absentSections.map(sec => (
                                <span 
                                  key={sec} 
                                  style={{
                                    background: absentSections.length > 3 ? 'var(--danger-bg)' : 'var(--warning-bg)',
                                    color: absentSections.length > 3 ? 'var(--danger)' : 'var(--warning)',
                                    fontSize: '0.72rem', 
                                    fontWeight: 700,
                                    padding: '0.1rem 0.4rem', 
                                    borderRadius: '6px', 
                                    border: '1px solid currentColor'
                                  }}
                                >
                                  S{sec}
                                </span>
                              ))}
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                ({absentSections.length}/10)
                              </span>
                            </div>
                          )}
                        </td>
                        <td><span className={`grade-badge ${gr.cls}`}>{gr.letter}</span></td>
                      </tr>
                    );
                  })
                ) : (
                  <tr key={s.studentId}>
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Avatar username={s.studentId} name={s.name} size="sm" />
                        {s.name}
                      </div>
                    </td>
                    <td colSpan={5} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      No course grades recorded.
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>No records found.</p>
          </div>
        )}
      </div>
    </>
  );
}
