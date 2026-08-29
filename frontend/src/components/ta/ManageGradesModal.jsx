import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Alert from '../common/Alert';

export default function ManageGradesModal({
  isOpen,
  onClose,
  student,
  editGrades,
  setEditGrades,
  onSave,
  loading,
  error,
  clearError
}) {
  if (!isOpen || !student) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3>Academic Grades: {student.name}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <Alert type="danger" message={error} onClose={clearError} />

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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '180px' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Absent Sections (tap to toggle)</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(sec => {
                      const absList = Array.isArray(g.absences) ? g.absences : [];
                      const isAbsent = absList.includes(sec);
                      return (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => {
                            const updated = [...editGrades];
                            const cur = Array.isArray(updated[idx].absences) ? [...updated[idx].absences] : [];
                            if (cur.includes(sec)) {
                              updated[idx].absences = cur.filter(s => s !== sec);
                            } else {
                              updated[idx].absences = [...cur, sec].sort((a, b) => a - b);
                            }
                            setEditGrades(updated);
                          }}
                          style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            border: isAbsent ? '2px solid var(--danger)' : '2px solid var(--border-dark)',
                            background: isAbsent ? 'var(--danger-bg)' : 'transparent',
                            color: isAbsent ? 'var(--danger)' : 'var(--text-muted)',
                            fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {sec}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Absent: {Array.isArray(g.absences) ? g.absences.length : 0} / 10 sections
                  </div>
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
                  <Trash2 size={16} />
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
            style={{ width: '100%', marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
            onClick={() => setEditGrades([...editGrades, { subject: '', score: 0, maxScore: 100, absences: [] }])}
          >
            <Plus size={18} /> Add New Subject Row
          </button>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onSave} disabled={loading}>
            {loading ? 'Saving Grades...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
