import React, { useState, useEffect } from 'react';
import { Search, CheckCircle, CalendarX2 } from 'lucide-react';
import Avatar from '../../components/common/Avatar';

export default function TakeAttendance({
  students,
  onSaveAttendance,
  saving
}) {
  const [subject, setSubject] = useState('');
  const [week, setWeek] = useState('');
  const [filter, setFilter] = useState('');
  const [sessionData, setSessionData] = useState({});

  // Get list of all subjects taught across the students list
  const allSubjects = [...new Set(students.flatMap(s => s.grades.map(g => g.subject)))].sort();

  // Initialize session attendance state when subject or week changes
  useEffect(() => {
    if (!subject || !week) return;
    const weekNum = parseInt(week);
    const map = {};
    students.forEach(s => {
      const entry = s.grades.find(g => g.subject === subject);
      if (entry) {
        const abs = Array.isArray(entry.absences) ? entry.absences : [];
        map[s.studentId] = !abs.includes(weekNum); // true = present, false = absent
      }
    });
    setSessionData(map);
  }, [subject, week, students]);

  const enrolledStudents = students
    .filter(s => s.grades.some(g => g.subject === subject))
    .filter(s => 
      s.name.toLowerCase().includes(filter.toLowerCase()) || 
      s.studentId.includes(filter)
    );

  const toggleStudent = (studentId) => {
    setSessionData(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  const handleSave = () => {
    if (!subject || !week) return;
    onSaveAttendance(subject, parseInt(week), sessionData);
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Class Attendance Checklist</h1>
          <p>Call student names one-by-one and toggle their session attendance status.</p>
        </div>
        {subject && week && (
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.75rem 1.5rem', fontSize: '0.95rem', fontWeight: 700,
              boxShadow: '0 4px 12px rgba(37,99,235,0.25)', borderRadius: '12px'
            }}
          >
            {saving ? (
              <>⌛ Saving Checklist...</>
            ) : (
              <>
                <CheckCircle size={18} />
                Save Attendance
              </>
            )}
          </button>
        )}
      </div>

      {/* COURSE & WEEK SELECTOR */}
      <div className="content-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1', minWidth: '240px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Select Active Course
            </label>
            <select
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={{
                width: '100%', padding: '0.75rem', borderRadius: '10px',
                border: '2px solid var(--border-dark)', background: 'var(--card-bg)',
                color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.92rem', outline: 'none'
              }}
            >
              <option value="">-- Choose Subject --</option>
              {allSubjects.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: '2', minWidth: '320px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Select Section / Week Number
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {[1,2,3,4,5,6,7,8,9,10].map(w => (
                <button
                  key={w}
                  onClick={() => setWeek(w.toString())}
                  className={`btn ${week === w.toString() ? 'btn-primary' : 'btn-outline'}`}
                  style={{
                    minWidth: '40px', height: '40px', padding: '0', borderRadius: '10px',
                    fontWeight: 700, fontSize: '0.9rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  W{w}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* STUDENTS ATTENDANCE INTERACTIVE LIST */}
      {!subject || !week ? (
        <div className="empty-state" style={{ padding: '4rem 2rem', background: 'rgba(255,255,255,0.4)', backdropFilter: 'blur(10px)', border: '1px solid var(--border)' }}>
          <div className="empty-icon" style={{ fontSize: '3rem' }}>📝</div>
          <h3 style={{ fontSize: '1.25rem', marginTop: '1rem', color: 'var(--text-primary)' }}>Awaiting Selection</h3>
          <p style={{ maxWidth: '380px', margin: '0.5rem auto 0', color: 'var(--text-muted)' }}>
            Please select a course and section week at the top to load the student attendance sheets.
          </p>
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '0.35rem 0.75rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem' }}>
                {subject}
              </span>
              <span className="badge" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', padding: '0.35rem 0.75rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem' }}>
                Section Week {week}
              </span>
            </div>

            <div className="topbar-search" style={{ margin: '0', width: '280px', background: 'var(--card-bg)', border: '1.5px solid var(--border-dark)', borderRadius: '10px' }}>
              <span className="search-icon"><Search size={16} /></span>
              <input
                placeholder="Search student names..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                style={{ fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {enrolledStudents.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>No students enrolled or found in this course.</p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '1.25rem',
              marginBottom: '2rem'
            }}>
              {enrolledStudents.map(s => {
                const isPresent = sessionData[s.studentId] !== false;
                return (
                  <div
                    key={s.studentId}
                    onClick={() => toggleStudent(s.studentId)}
                    style={{
                      background: isPresent ? 'var(--card-bg)' : 'rgba(254,242,242,0.8)',
                      borderRadius: '16px',
                      border: isPresent ? '2px solid var(--border)' : '2px solid rgba(239,68,68,0.3)',
                      padding: '1.25rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isPresent ? 'var(--shadow-sm)' : '0 4px 15px rgba(239,68,68,0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    className="attendance-card"
                  >
                    {/* Visual status bar at top of card */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
                      background: isPresent ? 'var(--success)' : 'var(--danger)'
                    }} />

                    <div style={{ marginTop: '0.5rem' }}>
                      <Avatar username={s.studentId} name={s.name} size="md" />
                    </div>

                    <h4 style={{ fontSize: '0.98rem', fontWeight: 700, margin: '0.75rem 0 0.15rem', color: 'var(--text-primary)' }}>
                      {s.name}
                    </h4>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      ID: #{s.studentId}
                    </span>

                    {/* Attendance Toggle status indicator */}
                    <div style={{ marginTop: '1.2rem', width: '100%' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        width: '100%', padding: '0.6rem', borderRadius: '10px',
                        fontSize: '0.85rem', fontWeight: 700,
                        background: isPresent ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                        color: isPresent ? 'var(--success)' : 'var(--danger)',
                        border: `1.5px solid ${isPresent ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
                      }}>
                        {isPresent ? (
                          <>
                            <CheckCircle size={16} />
                            PRESENT
                          </>
                        ) : (
                          <>
                            <CalendarX2 size={16} />
                            ABSENT
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
