import { useState, useEffect } from 'react';
import './index.css';
import logo from './assets/logo.png';


const API = 'http://localhost:5000/api';

function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('');
}

function getAvatarColor(username) {
  const colors = ['avatar-blue', 'avatar-green', 'avatar-purple', 'avatar-amber'];
  if (!username) return colors[0];
  const charSum = username.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[charSum % colors.length];
}

function getGradeLetter(score, max) {
  const p = (score / max) * 100;
  if (p >= 85) return { letter: 'A', cls: 'badge-a' };
  if (p >= 75) return { letter: 'B', cls: 'badge-b' };
  if (p >= 60) return { letter: 'C', cls: 'badge-c' };
  return { letter: 'F', cls: 'badge-f' };
}

function getProgressColor(score, max) {
  const p = (score / max) * 100;
  if (p >= 85) return 'progress-fill-green';
  if (p >= 75) return 'progress-fill-blue';
  if (p >= 60) return 'progress-fill-amber';
  return 'progress-fill-red';
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [students, setStudents] = useState([]);
  const [studentGrades, setStudentGrades] = useState(null); // Loaded for student role
  const [filter, setFilter] = useState('');

  // Navigation pages
  const [taPage, setTaPage] = useState('dashboard');
  const [studentPage, setStudentPage] = useState('dashboard');

  // Modals and operations
  const [showAddModal, setShowAddModal] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [editGrades, setEditGrades] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const clearMsg = () => { setError(''); setSuccess(''); };
  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };

  const fetchStudents = async () => {
    try {
      const r = await fetch(`${API}/grades`);
      if (r.ok) setStudents(await r.json());
    } catch (e) {
      setError('Cannot connect to the server');
    }
  };

  const fetchStudentData = async (studentId) => {
    try {
      const r = await fetch(`${API}/grades/${studentId}`);
      if (r.ok) setStudentGrades(await r.json());
    } catch (e) {
      setError('Could not retrieve student grade details');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please fill in both fields.');
      return;
    }
    setLoading(true);
    clearMsg();
    try {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Invalid username or password');

      setCurrentUser(d);
      if (d.role === 'ta') {
        fetchStudents();
        setTaPage('dashboard');
      } else if (d.role === 'student') {
        fetchStudentData(d.username);
        setStudentPage('dashboard');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newId.trim() || !newName.trim()) {
      setError('All fields are required.');
      return;
    }
    setLoading(true);
    clearMsg();
    try {
      const r = await fetch(`${API}/grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: newId.trim(), name: newName.trim() })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);

      setShowAddModal(false);
      setNewId('');
      setNewName('');
      showSuccess('Student added successfully.');
      fetchStudents();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sid, name) => {
    if (!window.confirm(`Permanently delete "${name}"?`)) return;
    clearMsg();
    try {
      const r = await fetch(`${API}/grades/${sid}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.message);
      }
      showSuccess('Student was deleted.');
      fetchStudents();
    } catch (e) {
      setError(e.message);
    }
  };

  const openGradeEdit = (s) => {
    setEditStudent(s);
    setEditGrades(s.grades.map(g => ({ ...g })));
    setShowGradeModal(true);
    clearMsg();
  };

  const saveGrades = async () => {
    for (const g of editGrades) {
      if (!g.subject.trim()) {
        setError('Subject name cannot be empty.');
        return;
      }
    }
    setLoading(true);
    clearMsg();
    try {
      const r = await fetch(`${API}/grades/${editStudent.studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grades: editGrades })
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.message);
      }
      setShowGradeModal(false);
      setEditStudent(null);
      showSuccess('Grades updated successfully.');
      fetchStudents();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setStudentGrades(null);
    setStudents([]);
    setUsername('');
    setPassword('');
    clearMsg();
  };

  // Helper autofills for demo
  const fillTA = () => { setUsername('abdo'); setPassword('abdo'); clearMsg(); };
  const fillStudent = () => { setUsername('1001'); setPassword('1001'); clearMsg(); };

  // Filter students
  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(filter.toLowerCase()) ||
    s.studentId.includes(filter)
  );
  const totalGrades = students.reduce((a, s) => a + s.grades.length, 0);

  // ==================== UNIVERSAL LOGIN SCREEN ====================
  if (!currentUser) return (
    <div className="login-page" style={{ backgroundImage: `url(${logo})` }}>
      <div className="login-card">
          <h1>Sign In</h1>
          <p className="login-subtitle">Enter your academic credentials below</p>

          {error && <div className="alert alert-danger" style={{ textAlign: 'left' }}>⚠️ {error}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Username / Student ID</label>
              <input
                placeholder="e.g. abdo or 1001"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1.75rem' }}>
              <label>Password</label>
              <input
                type="password"
                placeholder="••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', fontSize: '0.95rem' }}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In →'}
            </button>
          </form>

          <div style={{ marginTop: '2rem', padding: '1.25rem', background: '#f8fafc', borderRadius: '14px', border: '1px dashed #cbd5e1', textAlign: 'left' }}>
            <h4 style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Quick Demo Access</h4>
            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
              <button className="btn btn-outline btn-sm" style={{ justifyContent: 'flex-start', fontSize: '0.8rem', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }} onClick={fillTA}>
                👨‍🏫 Fill Instructor (abdo)
              </button>
              <button className="btn btn-outline btn-sm" style={{ justifyContent: 'flex-start', fontSize: '0.8rem', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }} onClick={fillStudent}>
                👨‍🎓 Fill Student (1001)
              </button>
            </div>
          </div>
        </div>
      </div>
    );

  // ==================== INSTRUCTOR (TA) PORTAL ====================
  if (currentUser.role === 'ta') return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>Gradely</h2>
          <span>Instructor Portal</span>
        </div>
        <nav className="sidebar-nav">
          <button className={`nav-item ${taPage === 'dashboard' ? 'active' : ''}`} onClick={() => setTaPage('dashboard')}>
            <span className="nav-icon">📊</span> Dashboard
          </button>
          <button className={`nav-item ${taPage === 'students' ? 'active' : ''}`} onClick={() => setTaPage('students')}>
            <span className="nav-icon">👥</span> Student Directory
          </button>
          <button className={`nav-item ${taPage === 'grades' ? 'active' : ''}`} onClick={() => setTaPage('grades')}>
            <span className="nav-icon">📝</span> Grade Log
          </button>

          {/* Sidebar Sign Out button at the bottom */}
          <button className="nav-item" onClick={logout} style={{ marginTop: 'auto', color: '#ef4444', fontWeight: 600 }}>
            <span className="nav-icon">🚪</span> Sign Out
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className={`avatar ${getAvatarColor(currentUser.username)}`}>{getInitials(currentUser.name)}</div>
          <div className="user-info">
            <h4>{currentUser.name}</h4>
            <p>Instructor</p>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="main-content">
        {/* TOPBAR */}
        <div className="topbar">
          <div className="topbar-search">
            <span className="search-icon">🔍</span>
            <input placeholder="Search records..." />
          </div>
          <div className="topbar-actions">
            <button className="topbar-icon-btn">🔔</button>
          </div>
        </div>

        {/* PAGE CONTENT */}
        <div className="page-content">
          {success && <div className="alert alert-success">✅ {success}</div>}
          {error && !showAddModal && !showGradeModal && <div className="alert alert-danger">⚠️ {error}</div>}

          {/* ---- TA DASHBOARD ---- */}
          {taPage === 'dashboard' && (
            <>
              <div className="page-header">
                <h1>Welcome back, {currentUser.name} 👋</h1>
                <p>Here is an overview of your academic records workspace today.</p>
              </div>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-info">
                    <label>Enrolled Students</label>
                    <div className="stat-value">{students.length}</div>
                  </div>
                  <div className="stat-icon stat-icon-blue">👥</div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <label>Total Grades Posted</label>
                    <div className="stat-value">{totalGrades}</div>
                  </div>
                  <div className="stat-icon stat-icon-green">📝</div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <label>Academic Status</label>
                    <div className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--success)' }}>Active ✅</div>
                  </div>
                  <div className="stat-icon stat-icon-amber">⚡</div>
                </div>
              </div>

              <div className="content-card">
                <h3>Recently Added Students</h3>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {students.slice(0, 3).map(s => (
                    <div key={s.studentId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
                      <div className={`avatar avatar-sm ${getAvatarColor(s.studentId)}`}>{getInitials(s.name)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{s.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ID: #{s.studentId}</div>
                      </div>
                      <span className="status-badge status-active">Registered</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ---- TA STUDENTS DIRECTORY ---- */}
          {taPage === 'students' && (
            <>
              <div className="page-header">
                <div className="page-header-row">
                  <div>
                    <h1>Student Directory</h1>
                    <p>Manage and view academic record listings.</p>
                  </div>
                  <div className="header-actions">
                    <button className="btn btn-primary" onClick={() => { setShowAddModal(true); clearMsg(); }}>
                      ➕ Add New Student
                    </button>
                  </div>
                </div>
              </div>

              <div className="table-card">
                <div className="table-toolbar">
                  <div className="table-search">
                    <span className="search-icon">🔍</span>
                    <input
                      placeholder="Search by name or ID..."
                      value={filter}
                      onChange={e => setFilter(e.target.value)}
                    />
                  </div>
                </div>

                {filtered.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Student Details</th>
                        <th>Subjects</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(s => (
                        <tr key={s.studentId}>
                          <td style={{ fontWeight: 700, color: 'var(--text-muted)' }}>#{s.studentId}</td>
                          <td>
                            <div className="student-cell">
                              <div className={`avatar avatar-sm ${getAvatarColor(s.studentId)}`}>{getInitials(s.name)}</div>
                              <div className="student-details">
                                <h4>{s.name}</h4>
                              </div>
                            </div>
                          </td>
                          <td>{s.grades.length} subjects</td>
                          <td><span className="status-badge status-active">Active</span></td>
                          <td>
                            <div className="actions-cell">
                              <button className="btn btn-outline btn-sm" onClick={() => openGradeEdit(s)}>
                                ✏️ Manage Grades
                              </button>
                              <button className="btn btn-danger-outline btn-sm" onClick={() => handleDelete(s.studentId, s.name)}>
                                🗑️ Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">📭</div>
                    <p>No student records found matching search filters.</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ---- TA GRADE LOGS ---- */}
          {taPage === 'grades' && (
            <>
              <div className="page-header">
                <h1>Grade Log Listing</h1>
                <p>Unified visual inspection table of all recorded course grades.</p>
              </div>

              <div className="table-card">
                <div className="table-toolbar">
                  <div className="table-search">
                    <span className="search-icon">🔍</span>
                    <input
                      placeholder="Filter student..."
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
                        <th>Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.flatMap(s =>
                        s.grades.length > 0 ? s.grades.map((g, idx) => {
                          const gr = getGradeLetter(g.score, g.maxScore);
                          return (
                            <tr key={`${s.studentId}-${idx}`}>
                              {idx === 0 ? (
                                <td rowSpan={s.grades.length} style={{ fontWeight: 600, verticalAlign: 'top' }}>
                                  {s.name}
                                </td>
                              ) : null}
                              <td>{g.subject}</td>
                              <td style={{ fontWeight: 700 }}>{g.score}</td>
                              <td>{g.maxScore}</td>
                              <td><span className={`grade-badge ${gr.cls}`}>{gr.letter}</span></td>
                            </tr>
                          );
                        }) : (
                          <tr key={s.studentId}>
                            <td style={{ fontWeight: 600 }}>{s.name}</td>
                            <td colSpan={4} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
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
          )}
        </div>
      </div>

      {/* ADD STUDENT MODAL */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Create Student Profile</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">⚠️ {error}</div>}
              <form onSubmit={handleAddStudent}>
                <div className="form-group">
                  <label>Student ID (Numeric)</label>
                  <input placeholder="e.g. 1004" value={newId} onChange={e => setNewId(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Full Name</label>
                  <input placeholder="e.g. John Doe" value={newName} onChange={e => setNewName(e.target.value)} required />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                    {loading ? 'Saving Student...' : 'Create Profile'}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => { setShowAddModal(false); clearMsg(); }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* EDIT GRADES MODAL */}
      {showGradeModal && editStudent && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3>Academic Grades: {editStudent.name}</h3>
              <button className="modal-close" onClick={() => { setShowGradeModal(false); setEditStudent(null); }}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">⚠️ {error}</div>}

              <div style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {editGrades.length > 0 ? editGrades.map((g, idx) => (
                  <div className="grade-edit-row" key={idx}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Subject</label>
                      <input
                        placeholder="e.g. Calculus 1"
                        value={g.subject}
                        onChange={e => {
                          const updated = [...editGrades];
                          updated[idx].subject = e.target.value;
                          setEditGrades(updated);
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Score</label>
                      <input
                        type="number"
                        placeholder="Score"
                        value={g.score}
                        onChange={e => {
                          const updated = [...editGrades];
                          updated[idx].score = Number(e.target.value);
                          setEditGrades(updated);
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Max</label>
                      <input
                        type="number"
                        placeholder="Max Score"
                        value={g.maxScore}
                        onChange={e => {
                          const updated = [...editGrades];
                          updated[idx].maxScore = Number(e.target.value);
                          setEditGrades(updated);
                        }}
                      />
                    </div>
                    <button
                      className="btn btn-danger-outline btn-sm"
                      style={{ height: '36px', width: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Remove Row"
                      onClick={() => {
                        const updated = [...editGrades];
                        updated.splice(idx, 1);
                        setEditGrades(updated);
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                )) : (
                  <div className="empty-state" style={{ padding: '2rem' }}>
                    <p>No grades recorded. Click the button below to add your first course entry.</p>
                  </div>
                )}
              </div>

              <button
                className="btn btn-outline"
                style={{ width: '100%', marginTop: '1rem', display: 'flex', justifyContent: 'center' }}
                onClick={() => setEditGrades([...editGrades, { subject: '', score: 0, maxScore: 100 }])}
              >
                ➕ Add New Subject Row
              </button>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setShowGradeModal(false); setEditStudent(null); }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveGrades} disabled={loading}>
                {loading ? 'Saving Grades...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ==================== STUDENT PORTAL ====================
  if (currentUser.role === 'student' && studentGrades) return (
    <div className="app-layout">
      {/* STUDENT SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>Gradely</h2>
          <span>Student Portal</span>
        </div>
        <nav className="sidebar-nav">
          <button className={`nav-item ${studentPage === 'dashboard' ? 'active' : ''}`} onClick={() => setStudentPage('dashboard')}>
            <span className="nav-icon">📊</span> Overview Dashboard
          </button>
          <button className={`nav-item ${studentPage === 'grades' ? 'active' : ''}`} onClick={() => setStudentPage('grades')}>
            <span className="nav-icon">📝</span> My Course Grades
          </button>
          <button className={`nav-item ${studentPage === 'performance' ? 'active' : ''}`} onClick={() => setStudentPage('performance')}>
            <span className="nav-icon">🏆</span> Visual Performance
          </button>

          {/* Sidebar Sign Out button at the bottom */}
          <button className="nav-item" onClick={logout} style={{ marginTop: 'auto', color: '#ef4444', fontWeight: 600 }}>
            <span className="nav-icon">🚪</span> Sign Out
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className={`avatar ${getAvatarColor(currentUser.username)}`}>{getInitials(currentUser.name)}</div>
          <div className="user-info">
            <h4>{currentUser.name}</h4>
            <p>ID: #{currentUser.username}</p>
          </div>
        </div>
      </aside>

      {/* STUDENT MAIN CONTENT */}
      <div className="main-content">
        {/* STUDENT TOPBAR */}
        <div className="topbar">
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            Welcome Back!
          </div>
          <div className="topbar-actions">
            <button className="topbar-icon-btn">🔔</button>
          </div>
        </div>

        {/* STUDENT PAGE CONTAINER */}
        <div className="page-content">
          {success && <div className="alert alert-success">✅ {success}</div>}
          {error && <div className="alert alert-danger">⚠️ {error}</div>}

          {/* ---- STUDENT DASHBOARD ---- */}
          {studentPage === 'dashboard' && (
            <>
              <div className="page-header">
                <h1>Welcome, {studentGrades.name}! 👋</h1>
                <p>Access your personalized student grade dashboard and review visual insights.</p>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-info">
                    <label>Enrolled Courses</label>
                    <div className="stat-value">{studentGrades.grades.length}</div>
                  </div>
                  <div className="stat-icon stat-icon-blue">📚</div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <label>Academic Status</label>
                    <div className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--success)' }}>Good Standing</div>
                  </div>
                  <div className="stat-icon stat-icon-green">✨</div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <label>Class Standing</label>
                    <div className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--info)' }}>Active Student</div>
                  </div>
                  <div className="stat-icon stat-icon-amber">🎓</div>
                </div>
              </div>

              <div className="content-card">
                <h3>Latest Academic Activity</h3>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="stat-icon stat-icon-green" style={{ width: '36px', height: '36px', fontSize: '1rem', borderRadius: '50%' }}>✓</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>All Grades Verified</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Updated live by course instructor</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0' }}>
                    <div className="stat-icon stat-icon-blue" style={{ width: '36px', height: '36px', fontSize: '1rem', borderRadius: '50%' }}>i</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Academic Portal Online</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Secure LTR Grade Access Enabled</div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ---- STUDENT MY GRADES ---- */}
          {studentPage === 'grades' && (
            <>
              <div className="page-header">
                <h1>My Course Grades</h1>
                <p>Detailed verification ledger of your academic marks.</p>
              </div>

              <div className="table-card">
                {studentGrades.grades.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Subject Name</th>
                        <th>Score Obtained</th>
                        <th>Maximum Score</th>
                        <th>Status Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentGrades.grades.map((g, idx) => {
                        const gr = getGradeLetter(g.score, g.maxScore);
                        return (
                          <tr key={idx}>
                            <td style={{ fontWeight: 600 }}>{g.subject}</td>
                            <td style={{ fontWeight: 700 }}>{g.score}</td>
                            <td>{g.maxScore}</td>
                            <td>
                              <span className={`grade-badge ${gr.cls}`}>{gr.letter}</span>
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
          )}

          {/* ---- STUDENT VISUAL PERFORMANCE ---- */}
          {studentPage === 'performance' && (
            <>
              <div className="page-header">
                <h1>Visual Performance Breakdown</h1>
                <p>A visual percentage progress tracking representation of your registered subjects.</p>
              </div>

              <div className="content-card">
                <h3>Subject Score Progress Bars</h3>
                {studentGrades.grades.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
                    {studentGrades.grades.map((g, idx) => {
                      const pct = Math.round((g.score / g.maxScore) * 100);
                      return (
                        <div className="progress-row" key={idx} style={{ margin: 0 }}>
                          <span className="progress-label" style={{ fontWeight: 600 }}>{g.subject}</span>
                          <div className="progress-bar-wrap">
                            <div className={`progress-fill ${getProgressColor(g.score, g.maxScore)}`} style={{ width: `${pct}%` }}></div>
                          </div>
                          <span className="progress-percent" style={{ width: '60px' }}>{pct}% ({g.score}/{g.maxScore})</span>
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
          )}
        </div>
      </div>
    </div>
  );

  return null;
}
