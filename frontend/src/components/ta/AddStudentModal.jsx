import React, { useState } from 'react';
import Alert from '../common/Alert';

export default function AddStudentModal({ isOpen, onClose, onSave, loading, error, clearError }) {
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(newId, newName, () => {
      setNewId('');
      setNewName('');
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Create Student Profile</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <Alert type="danger" message={error} onClose={clearError} />
          <form onSubmit={handleSubmit}>
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
              <button type="button" className="btn btn-outline" onClick={() => { onClose(); clearError(); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
