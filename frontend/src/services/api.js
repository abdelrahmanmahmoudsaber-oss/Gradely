const API = 'http://localhost:5000/api';

export const apiService = {
  async login(username, password) {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Invalid username or password');
    return d;
  },

  async getStudents() {
    const r = await fetch(`${API}/grades`);
    if (!r.ok) {
      const d = await r.json();
      throw new Error(d.message || 'Error fetching students');
    }
    return await r.json();
  },

  async getStudentGrades(studentId) {
    const r = await fetch(`${API}/grades/${studentId}`);
    if (!r.ok) {
      const d = await r.json();
      throw new Error(d.message || 'Error fetching student grades');
    }
    return await r.json();
  },

  async addStudent(studentId, name) {
    const r = await fetch(`${API}/grades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: studentId.trim(), name: name.trim() })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Error adding student');
    return d;
  },

  async updateStudentGrades(studentId, grades) {
    const r = await fetch(`${API}/grades/${studentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grades })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Error updating student grades');
    return d;
  },

  async deleteStudent(studentId) {
    const r = await fetch(`${API}/grades/${studentId}`, { method: 'DELETE' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Error deleting student');
    return d;
  }
};
