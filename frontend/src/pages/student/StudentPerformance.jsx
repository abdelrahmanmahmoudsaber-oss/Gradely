import React from 'react';

export default function StudentPerformance({ student }) {
  const getProgressColor = (score, maxScore) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 85) return 'progress-success';
    if (percentage >= 65) return 'progress-warning';
    return 'progress-danger';
  };

  return (
    <>
      <div className="page-header">
        <h1>Visual Performance Breakdown</h1>
        <p>A visual percentage progress tracking representation of your registered subjects.</p>
      </div>

      <div className="content-card">
        <h3>Subject Score Progress Bars</h3>
        {student.grades.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
            {student.grades.map((g, idx) => {
              const pct = Math.round((g.score / g.maxScore) * 100);
              return (
                <div className="progress-row" key={idx} style={{ margin: 0 }}>
                  <span className="progress-label" style={{ fontWeight: 600 }}>{g.subject}</span>
                  <div className="progress-bar-wrap">
                    <div 
                      className={`progress-fill ${getProgressColor(g.score, g.maxScore)}`} 
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                  <span className="progress-percent" style={{ width: '60px' }}>
                    {pct}% ({g.score}/{g.maxScore})
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>No courses found to show performance metrics.</p>
          </div>
        )}
      </div>
    </>
  );
}
