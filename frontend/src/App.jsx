import React, { useState, useEffect } from 'react';
import './index.css';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  ClipboardList, 
  TrendingUp, 
  Calendar 
} from 'lucide-react';

// Layout & Common Components
import DashboardLayout from './layouts/DashboardLayout';
import Alert from './components/common/Alert';

// Pages
import LoginPage from './pages/LoginPage';

// TA Pages & Modals
import TADashboard from './pages/ta/TADashboard';
import StudentDirectory from './pages/ta/StudentDirectory';
import GradeLog from './pages/ta/GradeLog';
import TakeAttendance from './pages/ta/TakeAttendance';
import AddStudentModal from './components/ta/AddStudentModal';
import ManageGradesModal from './components/ta/ManageGradesModal';

// Student Pages
import StudentDashboard from './pages/student/StudentDashboard';
import StudentGrades from './pages/student/StudentGrades';
import StudentPerformance from './pages/student/StudentPerformance';
import StudentAttendance from './pages/student/StudentAttendance';

// API Services Layer
import { apiService } from './services/api';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentData, setStudentData] = useState(null);
  
  // Navigation states
  const [taPage, setTaPage] = useState('dashboard');
  const [studentPage, setStudentPage] = useState('dashboard');

  // Modals & operational states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [loading, setLoading] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Auto-dismissible notifications helper
  const showSuccessMessage = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3500);
  };

  const handleFetchStudents = async () => {
    try {
      const data = await apiService.getStudents();
      setStudents(data);
    } catch (err) {
      setError(err.message || 'Cannot connect to the server');
    }
  };

  const handleFetchStudentData = async (studentId) => {
    try {
      const data = await apiService.getStudentGrades(studentId);
      setStudentData(data);
    } catch (err) {
      setError(err.message || 'Could not retrieve student grade details');
    }
  };

  const handleLogin = async (username, password) => {
    setLoading(true);
    setError('');
    try {
      const user = await apiService.login(username, password);
      setCurrentUser(user);
      if (user.role === 'ta') {
        await handleFetchStudents();
        setTaPage('dashboard');
      } else {
        await handleFetchStudentData(user.username);
        setStudentPage('dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setStudentData(null);
    setStudents([]);
    setError('');
    setSuccess('');
  };

  const handleAddStudent = async (studentId, name) => {
    setLoading(true);
    setError('');
    try {
      await apiService.addStudent(studentId, name);
      setShowAddModal(false);
      showSuccessMessage('Student added successfully.');
      await handleFetchStudents();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStudent = async (studentId, name) => {
    if (!window.confirm(`Permanently delete "${name}"?`)) return;
    setError('');
    try {
      await apiService.deleteStudent(studentId);
      showSuccessMessage('Student record deleted successfully.');
      await handleFetchStudents();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpenGradeEdit = (student) => {
    setSelectedStudent(student);
    setShowGradeModal(true);
  };

  const handleUpdateGrades = async (grades) => {
    setLoading(true);
    setError('');
    try {
      await apiService.updateStudentGrades(selectedStudent.studentId, grades);
      setShowGradeModal(false);
      setSelectedStudent(null);
      showSuccessMessage('Student grades updated successfully.');
      await handleFetchStudents();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAttendance = async (subject, weekNum, sessionData) => {
    setSavingAttendance(true);
    setError('');
    try {
      // Loop over students and update individual absences based on state
      const enrolled = students.filter(s => s.grades.some(g => g.subject === subject));
      
      for (const s of enrolled) {
        const isPresent = sessionData[s.studentId] !== false;
        const updatedGrades = s.grades.map(g => {
          if (g.subject !== subject) return g;
          const abs = Array.isArray(g.absences) ? [...g.absences] : [];
          if (isPresent) {
            return { ...g, absences: abs.filter(x => x !== weekNum) };
          } else {
            if (!abs.includes(weekNum)) return { ...g, absences: [...abs, weekNum].sort((a,b)=>a-b) };
          }
          return g;
        });
        await apiService.updateStudentGrades(s.studentId, updatedGrades);
      }
      
      showSuccessMessage(`Attendance saved for ${subject} — Section Week ${weekNum}`);
      await handleFetchStudents();
    } catch (err) {
      setError('Error saving session attendance');
    } finally {
      setSavingAttendance(false);
    }
  };

  // ---------------- Render Flow ----------------

  if (!currentUser) {
    return (
      <LoginPage 
        onLogin={handleLogin} 
        error={error} 
        loading={loading} 
        clearError={() => setError('')} 
      />
    );
  }

  // --- TA (Instructor) Workspace ---
  if (currentUser.role === 'ta') {
    const taNavItems = [
      { label: 'Dashboard', value: 'dashboard', icon: LayoutDashboard },
      { label: 'Student Directory', value: 'directory', icon: Users },
      { label: 'Grade Log', value: 'grades', icon: BookOpen },
      { label: 'Take Attendance', value: 'attendance', icon: ClipboardList }
    ];

    return (
      <DashboardLayout
        user={currentUser}
        sidebarTitle="Gradely"
        sidebarSubtitle="Instructor Panel"
        navItems={taNavItems}
        activePage={taPage}
        onPageChange={(page) => { setTaPage(page); setError(''); setSuccess(''); }}
        onLogout={handleLogout}
      >
        {success && <Alert type="success" message={success} />}
        {error && <Alert type="danger" message={error} />}

        {taPage === 'dashboard' && (
          <TADashboard 
            user={currentUser} 
            students={students} 
          />
        )}

        {taPage === 'directory' && (
          <StudentDirectory
            students={students}
            onAddClick={() => setShowAddModal(true)}
            onManageGradesClick={handleOpenGradeEdit}
            onDeleteClick={handleDeleteStudent}
          />
        )}

        {taPage === 'grades' && (
          <GradeLog 
            students={students} 
          />
        )}

        {taPage === 'attendance' && (
          <TakeAttendance
            students={students}
            onSaveAttendance={handleSaveAttendance}
            saving={savingAttendance}
          />
        )}

        {showAddModal && (
          <AddStudentModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            onAdd={handleAddStudent}
            loading={loading}
          />
        )}

        {showGradeModal && selectedStudent && (
          <ManageGradesModal
            isOpen={showGradeModal}
            student={selectedStudent}
            onClose={() => { setShowGradeModal(false); setSelectedStudent(null); }}
            onSave={handleUpdateGrades}
            loading={loading}
          />
        )}
      </DashboardLayout>
    );
  }

  // --- Student Workspace ---
  const studentNavItems = [
    { label: 'Dashboard', value: 'dashboard', icon: LayoutDashboard },
    { label: 'My Grades', value: 'grades', icon: BookOpen },
    { label: 'Attendance Ledger', value: 'attendance', icon: Calendar },
    { label: 'Performance Breakdown', value: 'performance', icon: TrendingUp }
  ];

  return (
    <DashboardLayout
      user={currentUser}
      sidebarTitle="Gradely"
      sidebarSubtitle="Student Portal"
      navItems={studentNavItems}
      activePage={studentPage}
      onPageChange={(page) => { setStudentPage(page); setError(''); setSuccess(''); }}
      onLogout={handleLogout}
    >
      {success && <Alert type="success" message={success} />}
      {error && <Alert type="danger" message={error} />}

      {studentData && (
        <>
          {studentPage === 'dashboard' && (
            <StudentDashboard 
              student={studentData} 
            />
          )}

          {studentPage === 'grades' && (
            <StudentGrades 
              student={studentData} 
            />
          )}

          {studentPage === 'attendance' && (
            <StudentAttendance 
              student={studentData} 
            />
          )}

          {studentPage === 'performance' && (
            <StudentPerformance 
              student={studentData} 
            />
          )}
        </>
      )}
    </DashboardLayout>
  );
}
