import React, { useState } from 'react';
import { Search, UserPlus, Edit2, Trash2 } from 'lucide-react';
import Avatar from '../../components/common/Avatar';

export default function StudentDirectory({
  students,
  onAddClick,
  onManageGradesClick,
  onDeleteClick
}) {
  const [filter, setFilter] = useState('');

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(filter.toLowerCase()) ||
    s.studentId.includes(filter)
  );

  return (
    <>
      <div className="page-header">
        <div className="page-header-row" style={{ margin: 0 }}>
          <div>
            <h1>Student Directory</h1>
            <p>Manage and view academic record listings.</p>
          </div>
          <div className="header-actions">
            <button 
              className="btn btn-primary" 
              onClick={onAddClick} 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <UserPlus size={18} /> Add New Student
            </button>
          </div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-toolbar">
          <div className="table-search">
            <span className="search-icon"><Search size={18} /></span>
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
                      <Avatar username={s.studentId} name={s.name} size="sm" />
                      <div className="student-details">
                        <h4>{s.name}</h4>
                      </div>
                    </div>
                  </td>
                  <td>{s.grades.length} subjects</td>
                  <td><span className="status-badge status-active">Active</span></td>
                  <td>
                    <div className="actions-cell">
                      <button 
                        className="btn btn-outline btn-sm" 
                        onClick={() => onManageGradesClick(s)} 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <Edit2 size={14} /> Manage Grades
                      </button>
                      <button 
                        className="btn btn-danger-outline btn-sm" 
                        onClick={() => onDeleteClick(s.studentId, s.name)} 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <Trash2 size={14} /> Delete
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
  );
}
