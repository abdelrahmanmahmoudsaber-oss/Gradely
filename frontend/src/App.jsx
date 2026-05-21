import { useState } from 'react';
import './index.css';

function App() {
  const [studentId, setStudentId] = useState('');
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!studentId.trim()) {
      setError('الرجاء إدخال رقم الجلوس أو ID');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`http://localhost:5000/api/grades/${studentId}`);
      if (!response.ok) {
        throw new Error('لم يتم العثور على طالب بهذا الرقم');
      }
      const data = await response.json();
      setStudentData(data);
    } catch (err) {
      setError(err.message);
      setStudentData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStudentData(null);
    setStudentId('');
    setError('');
  };

  return (
    <div className="container" dir="rtl">
      <div className="glass-card">
        {!studentData ? (
          <>
            <h1>Gradely</h1>
            <p className="subtitle">بوابتك لمعرفة درجاتك بسهولة وسرعة</p>
            
            {error && <div className="error">{error}</div>}
            
            <form onSubmit={handleSearch} className="input-group">
              <input
                type="text"
                placeholder="أدخل رقم الـ ID الخاص بك..."
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              />
              <button type="submit" disabled={loading}>
                {loading ? 'جاري البحث...' : 'عرض النتيجة'}
              </button>
            </form>
          </>
        ) : (
          <div className="results-section">
            <div className="results-header">
              <h2>مرحباً، {studentData.name}</h2>
              <p className="subtitle">رقم الطالب: {studentData.studentId}</p>
            </div>
            
            <div className="grades-list">
              {studentData.grades.map((grade, index) => (
                <div key={index} className="grade-item">
                  <span className="subject">{grade.subject}</span>
                  <span className="score">{grade.score} / {grade.maxScore}</span>
                </div>
              ))}
            </div>
            
            <button className="back-btn" onClick={handleBack}>
              بحث عن طالب آخر
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
