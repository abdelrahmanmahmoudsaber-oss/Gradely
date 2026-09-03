import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { cacheManager } from '../utils/dataCache';
import { printStudentReportPDF } from '../utils/pdfHelper';
import { 
  LogOut, BookOpen, Calendar, FileText, GraduationCap, UserCheck, 
  Award, TrendingUp, Star, CheckCircle2, AlertTriangle, Printer, 
  BarChart3, Sparkles, Trophy, Target
} from 'lucide-react';

const SUBJECT_COLORS = [
  { bg: 'rgba(79, 70, 229, 0.15)', border: 'var(--primary)', text: 'var(--primary-hover)', tag: '#6366f1' },
  { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#34d399', tag: '#10b981' },
  { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#fbbf24', tag: '#f59e0b' },
  { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#60a5fa', tag: '#3b82f6' },
  { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#f472b6', tag: '#ec4899' },
  { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', text: '#a78bfa', tag: '#8b5cf6' },
  { bg: 'rgba(20, 184, 166, 0.15)', border: '#14b8a6', text: '#2dd4bf', tag: '#14b8a6' },
];

export default function StudentDashboard({ user, onLogout }) {
  const [subjects, setSubjects] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [viewMode, setViewMode] = useState('attendance'); // 'attendance', 'grades', 'analytics'

  // Dynamic Visibility Settings controlled by Super Admin
  const [visibility, setVisibility] = useState({
    showQuiz1: true,
    showQuiz2: true,
    showProject: true,
    showAttendanceScore: true,
    showTotal: true,
    showAttendanceTab: true
  });

  useEffect(() => {
    fetchData();
  }, [user.user_id]);

  const normalizeYear = (yr) => {
    if (!yr) return '';
    const s = yr.toString().trim();
    const numMatch = s.match(/\d+/);
    if (numMatch) {
      const n = parseInt(numMatch[0], 10);
      if (n >= 1 && n <= 6) return String(n);
    }
    if (/أول|الأولى/i.test(s)) return '1';
    if (/ثاني|الثانية/i.test(s)) return '2';
    if (/ثالث|الثالثة/i.test(s)) return '3';
    if (/رابع|الرابعة/i.test(s)) return '4';
    const lower = s.toLowerCase();
    if (lower.includes('first') || lower.includes('one')) return '1';
    if (lower.includes('second') || lower.includes('two')) return '2';
    if (lower.includes('third') || lower.includes('three')) return '3';
    if (lower.includes('fourth') || lower.includes('four')) return '4';
    return '';
  };

  const getStudentSubSection = (student, subId) => {
    if (student && Array.isArray(student.assigned_subjects)) {
      const match = student.assigned_subjects.find(entry => typeof entry === 'string' && entry.startsWith(subId + ':'));
      if (match) return normalizeSection(match.split(':')[1]);
    }
    return normalizeSection(student?.section || 'S1');
  };

  const normalizeSection = (sec) => {
    if (!sec) return 'S1';
    const s = sec.toString().trim().toUpperCase().replace(/\s+/g, '');
    const match = s.match(/(\d+)/);
    if (match) return 'S' + parseInt(match[1], 10);
    return 'S1';
  };

  const parseVisibilityFromSubjects = (subList) => {
    if (!Array.isArray(subList)) return null;
    const settings = {
      global: {
        showQuiz1: true,
        showQuiz2: true,
        showProject: true,
        showAttendanceScore: true,
        showTotal: true,
        showAttendanceTab: true
      }
    };

    for (const sub of subList) {
      if (Array.isArray(sub.excluded_students)) {
        sub.excluded_students.forEach(item => {
          if (typeof item === 'string') {
            if (item.startsWith('CONFIG:')) {
              try { settings.global = JSON.parse(item.replace('CONFIG:', '')); } catch (e) {}
            } else if (item.startsWith('CONFIG_SUB:')) {
              try {
                const parsed = JSON.parse(item.replace('CONFIG_SUB:', ''));
                Object.assign(settings, parsed);
              } catch (e) {}
            }
          }
        });
      }
    }
    return settings;
  };

  const getSubVisibility = (subId) => {
    if (!visibility) return { showQuiz1: true, showQuiz2: true, showProject: true, showAttendanceScore: true, showTotal: true, showAttendanceTab: true };
    return visibility[subId] || visibility.global || visibility;
  };

  const fetchData = async () => {
    const cacheKey = 'student_data_' + user.user_id;
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      setSubjects(cached.subjects);
      setAttendance(cached.attendance);
      setGrades(cached.grades);
      if (cached.visibility) {
        setVisibility(cached.visibility);
        const gVis = cached.visibility.global || cached.visibility;
        setViewMode('attendance');
      }
      if (cached.subjects.length > 0) setSelectedSubjectId(cached.subjects[0].id);
      setLoading(false);
      return;
    }

    try {
      const [subRes, attRes, grdRes] = await Promise.all([
        supabase.from('subjects').select('id, name, year_level, total_weeks, instructor_name, enrolled_students, excluded_students'),
        supabase.from('attendance').select('subject_id, week_number, status').eq('student_id', user.user_id).order('week_number', { ascending: true }),
        supabase.from('grades').select('subject_id, quiz_1, quiz_2, project, attendance_score, final_grade').eq('student_id', user.user_id)
      ]);

      const subData = subRes.data || [];
      const attData = attRes.data || [];
      const grdData = grdRes.data || [];

      let currentVisibility = {
        showQuiz1: true,
        showQuiz2: true,
        showProject: true,
        showAttendanceScore: true,
        showTotal: true,
        showAttendanceTab: true
      };

      const parsed = parseVisibilityFromSubjects(subData);
      if (parsed) currentVisibility = parsed;

      setVisibility(currentVisibility);
      const gVis = currentVisibility.global || currentVisibility;
      setViewMode('attendance');

      const studentSubjects = subData.filter(s => {
        if (Array.isArray(s.enrolled_students)) {
          return s.enrolled_students.includes(user.user_id);
        }
        return false;
      });

      const cleanSubjects = studentSubjects.map(({ enrolled_students, excluded_students, ...rest }) => rest);

      setSubjects(cleanSubjects);
      setAttendance(attData);
      setGrades(grdData);

      if (cleanSubjects.length > 0) {
        setSelectedSubjectId(cleanSubjects[0].id);
      }

      cacheManager.set(cacheKey, {
        subjects: cleanSubjects,
        attendance: attData,
        grades: grdData,
        visibility: currentVisibility
      });

    } catch (e) {
      console.error('Error fetching student dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportMyReportPDF = () => {
    printStudentReportPDF({
      student: user,
      subjects: subjects,
      grades: grades,
      attendance: attendance,
      options: {
        includeAttendanceDetails: currentSubVis.showAttendanceTab,
        includeGrades: true,
        includeQuizzes: currentSubVis.showQuiz1 || currentSubVis.showQuiz2,
        includeProject: currentSubVis.showProject,
        includeAttendanceScore: currentSubVis.showAttendanceScore,
        includeTotal: currentSubVis.showTotal,
        selectedSubjectIds: subjects.map(s => s.id)
      }
    });
  };

  if (loading) {
    return (
      <div style={{display: 'flex', minHeight: '100vh', width: '100%', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)'}}>
        <div style={{textAlign: 'center', color: 'var(--text-muted)'}}>
          <div style={{fontSize: '2rem', marginBottom: '1rem'}}>⏳</div>
          جاري تحميل بياناتك الأكاديمية...
        </div>
      </div>
    );
  }

  // Calculate Overall Analytics
  const totalRecordedSessions = attendance.length;
  const totalAttendedSessions = attendance.filter(a => a.status === 'present' || a.status === 'late').length;
  const totalAbsences = attendance.filter(a => a.status === 'absent').length;
  const attendanceRate = totalRecordedSessions > 0 ? Math.round((totalAttendedSessions / totalRecordedSessions) * 100) : 100;

  // Compute Subject Analytics Breakdown
  let bestAttendanceSub = null;
  let highestRate = -1;
  let bestGradesSub = null;
  let highestScore = -1;
  let totalCalculatedMarks = 0;
  let scoredSubjectsCount = 0;

  const subjectStats = subjects.map(sub => {
    const subAtt = attendance.filter(a => a.subject_id === sub.id);
    const attendedCount = subAtt.filter(a => a.status === 'present' || a.status === 'late').length;
    const absSubCount = subAtt.filter(a => a.status === 'absent').length;
    const subRate = subAtt.length > 0 ? Math.round((attendedCount / subAtt.length) * 100) : 100;

    const g = grades.find(grd => grd.subject_id === sub.id) || {};
    const subVis = getSubVisibility(sub.id);
    let subTotal = 0;
    if (subVis.showQuiz1) subTotal += (g.quiz_1 || 0);
    if (subVis.showQuiz2) subTotal += (g.quiz_2 || 0);
    if (subVis.showProject) subTotal += (g.project || 0);
    if (subVis.showAttendanceScore) subTotal += (g.attendance_score || 0);

    if (subAtt.length > 0 && subRate > highestRate) {
      highestRate = subRate;
      bestAttendanceSub = { name: sub.name, rate: subRate };
    }

    if (subTotal > highestScore && subTotal > 0) {
      highestScore = subTotal;
      bestGradesSub = { name: sub.name, score: subTotal };
    }

    if (subTotal > 0) {
      totalCalculatedMarks += subTotal;
      scoredSubjectsCount++;
    }

    return {
      id: sub.id,
      name: sub.name,
      year: normalizeYear(sub.year_level),
      instructor: sub.instructor_name || 'المدير الرئيسي',
      attendedCount,
      absSubCount,
      rate: subRate,
      score: subTotal,
      gradeDetails: g
    };
  });

  const currentSubject = subjects.find(s => s.id === selectedSubjectId);
  const currentGrades = grades.find(g => g.subject_id === selectedSubjectId) || {};
  const currentAttendance = attendance.filter(a => a.subject_id === selectedSubjectId);
  const absCount = currentAttendance.filter(a => a.status === 'absent').length;

  // Calculate dynamic visible total score for current subject
  const currentSubVis = getSubVisibility(selectedSubjectId);
  let visibleTotal = 0;
  let hasAnyGradeVisible = false;
  if (currentSubVis.showQuiz1) { visibleTotal += (currentGrades.quiz_1 || 0); hasAnyGradeVisible = true; }
  if (currentSubVis.showQuiz2) { visibleTotal += (currentGrades.quiz_2 || 0); hasAnyGradeVisible = true; }
  if (currentSubVis.showProject) { visibleTotal += (currentGrades.project || 0); hasAnyGradeVisible = true; }
  if (currentSubVis.showAttendanceScore) { visibleTotal += (currentGrades.attendance_score || 0); hasAnyGradeVisible = true; }

  return (
    <div style={{minHeight: '100vh', width: '100%', flex: 1, background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflowX: 'hidden'}}>
      
      {/* Student Topbar */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0.8rem clamp(1rem, 3vw, 2rem)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        flexWrap: 'wrap',
        gap: '0.8rem'
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.8rem'}}>
          <div style={{background: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary-hover)', padding: '6px', borderRadius: '8px', display: 'flex'}}>
            <GraduationCap size={22} />
          </div>
          <h2 style={{margin: 0, fontSize: 'clamp(1.1rem, 2.5vw, 1.3rem)'}}>Gradely — بوابة الطالب</h2>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'0.8rem',flexWrap:'wrap'}}>
          <span className="badge" style={{background:'rgba(16, 185, 129, 0.1)',color:'var(--success)',border:'1px solid rgba(16, 185, 129, 0.2)',padding:'5px 10px',fontWeight:700,fontSize:'0.8rem'}}>
            فرقة {normalizeYear(user.year_level)} | {normalizeSection(user.section || 'S1')}
          </span>

          

          <button 
            onClick={onLogout} 
            style={{
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              padding: '6px 12px',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              transition: 'all 0.2s'
            }}
          >
            <LogOut size={14} /> خروج
          </button>
        </div>
      </header>

      <main style={{maxWidth: '1200px', width: '100%', margin: '0 auto', padding: 'clamp(1rem, 3vw, 2rem)', flex: 1, boxSizing: 'border-box'}}>
        
        {/* Welcome Section */}
        <div className="fade-in" style={{marginBottom: '2rem', textAlign: 'center'}}>
          <h1 style={{fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', marginBottom: '0.4rem', fontWeight: 800}}>
            أهلاً بك، <span style={{color: 'var(--primary-hover)'}}>{user.name}</span> 👋
          </h1>
          <p className="text-muted" style={{fontSize: '0.95rem', margin: 0}}>
            الرقم الأكاديمي: <strong>{user.user_id}</strong> | فرقة الطالب: <strong>الفرقة {normalizeYear(user.year_level)}</strong>
          </p>
        </div>

        {/* 🌟 MONTHLY & SEMESTER ANALYTICS OVERVIEW CARDS */}
        {subjects.length > 0 && (
          <div className="grid-cards fade-in" style={{marginBottom: '2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem'}}>
            
            {/* Total Subjects */}
            <div className="panel" style={{display: 'flex', alignItems: 'center', gap: '1rem', borderTop: '4px solid var(--primary-hover)'}}>
              <div style={{background: 'rgba(79, 70, 229, 0.1)', padding: '0.9rem', borderRadius: '50%', color: 'var(--primary-hover)'}}>
                <BookOpen size={24} />
              </div>
              <div>
                <p className="text-muted" style={{margin: '0 0 3px 0', fontSize: '0.85rem'}}>المواد المسجلة</p>
                <h3 style={{margin: 0, fontSize: '1.5rem', fontWeight: 800}}>{subjects.length} مقررات</h3>
              </div>
            </div>

            {/* Attendance Rate */}
            {currentSubVis.showAttendanceTab && (
              <div className="panel" style={{display: 'flex', alignItems: 'center', gap: '1rem', borderTop: '4px solid #10b981'}}>
                <div style={{background: 'rgba(16, 185, 129, 0.1)', padding: '0.9rem', borderRadius: '50%', color: '#10b981'}}>
                  <UserCheck size={24} />
                </div>
                <div>
                  <p className="text-muted" style={{margin: '0 0 3px 0', fontSize: '0.85rem'}}>نسبة الالتزام والنشاط</p>
                  <h3 style={{margin: 0, fontSize: '1.5rem', fontWeight: 800, color: attendanceRate >= 80 ? 'var(--success)' : '#f59e0b'}}>
                    {attendanceRate}%
                  </h3>
                </div>
              </div>
            )}

            {/* Best Attendance Subject */}
            {currentSubVis.showAttendanceTab && bestAttendanceSub && (
              <div className="panel" style={{display: 'flex', alignItems: 'center', gap: '1rem', borderTop: '4px solid #f59e0b'}}>
                <div style={{background: 'rgba(245, 158, 11, 0.1)', padding: '0.9rem', borderRadius: '50%', color: '#f59e0b'}}>
                  <Trophy size={24} />
                </div>
                <div>
                  <p className="text-muted" style={{margin: '0 0 3px 0', fontSize: '0.85rem'}}>الأعلى التزاماً وحضوراً</p>
                  <h3 style={{margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f59e0b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'160px'}}>
                    {bestAttendanceSub.name}
                  </h3>
                  <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>نسبة حضور: {bestAttendanceSub.rate}%</span>
                </div>
              </div>
            )}

            {/* Highest Grade Subject */}
            {currentSubVis.showTotal && bestGradesSub && (
              <div className="panel" style={{display: 'flex', alignItems: 'center', gap: '1rem', borderTop: '4px solid #3b82f6'}}>
                <div style={{background: 'rgba(59, 130, 246, 0.1)', padding: '0.9rem', borderRadius: '50%', color: '#3b82f6'}}>
                  <Star size={24} />
                </div>
                <div>
                  <p className="text-muted" style={{margin: '0 0 3px 0', fontSize: '0.85rem'}}>المادة الأكثر تميزاً</p>
                  <h3 style={{margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#3b82f6', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'160px'}}>
                    {bestGradesSub.name}
                  </h3>
                  <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>الدرجة: {bestGradesSub.score} درجة</span>
                </div>
              </div>
            )}

          </div>
        )}

        {/* COLORFUL SUBJECT CARDS SELECTOR */}
        {subjects.length > 0 && (
          <div style={{marginBottom: '2rem'}}>
            <h3 style={{marginBottom: '0.8rem', fontSize: '1.05rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px'}}>
              <BookOpen size={18} /> المقررات الدراسية:
            </h3>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.8rem'}}>
              {subjects.map((sub, index) => {
                const color = SUBJECT_COLORS[index % SUBJECT_COLORS.length];
                const isSelected = sub.id === selectedSubjectId;
                return (
                  <div
                    key={sub.id}
                    onClick={() => setSelectedSubjectId(sub.id)}
                    style={{
                      background: isSelected ? color.bg : 'var(--surface)',
                      border: isSelected ? ('2px solid ' + color.border) : '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 6px 20px rgba(0,0,0,0.3)' : 'none'
                    }}
                  >
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'6px'}}>
                      <h4 style={{margin:0,fontSize:'1.1rem',fontWeight:800,color: isSelected ? color.text : 'var(--text-main)'}}>
                        {sub.name}
                      </h4>
                      <span className="badge" style={{background: color.bg, color: color.text, border: '1px solid ' + color.border, fontSize:'0.75rem'}}>
                        مستوى المقرر: فرقة {normalizeYear(sub.year_level)}
                      </span>
                    </div>
                    <div style={{fontSize:'0.8rem',color:'var(--text-muted)',display:'flex',flexDirection:'column',gap:'2px'}}>
                      <div>المعيد: <strong style={{color:'var(--text-main)'}}>{sub.instructor_name || 'المدير الرئيسي'}</strong></div>
                      <div>السكشن: <strong style={{color:'var(--success)'}}>{getStudentSubSection(user, sub.id)}</strong></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Subject Details */}
        {currentSubject ? (
          <div className="panel fade-in" style={{padding: 'clamp(1rem, 2.5vw, 1.8rem)'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.2rem'}}>
              <div>
                <h2 style={{margin: '0 0 4px 0', fontSize: 'clamp(1.3rem, 3vw, 1.6rem)', color: 'var(--primary-hover)', fontWeight: 800}}>
                  {currentSubject.name}
                </h2>
                <p className="text-muted" style={{margin: 0, fontSize: '0.85rem'}}>
                  المعيد: <strong style={{color:'var(--text-main)'}}>{currentSubject.instructor_name || 'المدير الرئيسي'}</strong> | السكشن: <strong style={{color:'var(--success)'}}>{getStudentSubSection(user, currentSubject.id)}</strong>
                </p>
              </div>

              {/* View Toggle (Only shown if attendance tab is enabled) */}
              {currentSubVis.showAttendanceTab && (
                <div style={{display: 'flex', gap: '6px', background: 'var(--bg)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)'}}>
                  <button 
                    onClick={() => setViewMode('attendance')}
                    style={{
                      background: viewMode === 'attendance' ? 'var(--primary)' : 'transparent',
                      color: viewMode === 'attendance' ? 'white' : 'var(--text-muted)',
                      border: 'none',
                      padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '6px', fontSize:'0.9rem', transition: 'all 0.15s'
                    }}
                  >
                    <Calendar size={16} /> سجل الغياب
                  </button>
                  <button 
                    onClick={() => setViewMode('grades')}
                    style={{
                      background: viewMode === 'grades' ? 'var(--primary)' : 'transparent',
                      color: viewMode === 'grades' ? 'white' : 'var(--text-muted)',
                      border: 'none',
                      padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '6px', fontSize:'0.9rem', transition: 'all 0.15s'
                    }}
                  >
                    <FileText size={16} /> الدرجات
                  </button>
                </div>
              )}
            </div>

            {/* Attendance View */}
            {viewMode === 'attendance' && (
              <div className="fade-in">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.2rem',flexWrap:'wrap',gap:'0.8rem'}}>
                  <h4 style={{margin: 0, color: 'var(--text-muted)', fontSize:'0.95rem'}}>
                    سجل الأسابيع — إجمالي الغياب: <span style={{color: absCount > 3 ? 'var(--danger)' : 'var(--success)', fontWeight:'bold'}}>{absCount} مرات</span>
                  </h4>
                  <div style={{display:'flex',gap:'10px',fontSize:'0.8rem',flexWrap:'wrap'}}>
                    <span style={{color:'var(--success)',fontWeight:'bold'}}>● حاضر</span>
                    <span style={{color:'var(--danger)',fontWeight:'bold'}}>● غائب</span>
                    <span style={{color:'var(--warning)',fontWeight:'bold'}}>● تأخير</span>
                    <span style={{color:'#3b82f6',fontWeight:'bold'}}>● عذر</span>
                  </div>
                </div>

                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px'}}>
                  {Array.from({ length: currentSubject.total_weeks || 12 }, (_, i) => i + 1).map(w => {
                    const record = currentAttendance.find(a => a.week_number === w);
                    let statusLabel = 'لم يرصد';
                    let statusColor = 'var(--text-muted)';
                    let bg = 'var(--bg)';
                    let border = 'var(--border)';

                    if (record) {
                      if (record.status === 'present') {
                        statusLabel = 'حاضر ✓';
                        statusColor = 'var(--success)';
                        bg = 'rgba(16, 185, 129, 0.1)';
                        border = 'var(--success)';
                      } else if (record.status === 'absent') {
                        statusLabel = 'غائب ✗';
                        statusColor = 'var(--danger)';
                        bg = 'rgba(239, 68, 68, 0.1)';
                        border = 'var(--danger)';
                      } else if (record.status === 'late') {
                        statusLabel = 'تأخير';
                        statusColor = 'var(--warning)';
                        bg = 'rgba(245, 158, 11, 0.1)';
                        border = 'var(--warning)';
                      } else if (record.status === 'excused') {
                        statusLabel = 'عذر';
                        statusColor = '#3b82f6';
                        bg = 'rgba(59, 130, 246, 0.1)';
                        border = '#3b82f6';
                      }
                    }

                    return (
                      <div key={w} style={{background: bg, border: '1px solid ' + border, borderRadius: '6px', padding: '10px 6px', textAlign: 'center'}}>
                        <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px'}}>الأسبوع {w}</div>
                        <div style={{fontWeight: 'bold', color: statusColor, fontSize: '0.85rem'}}>{statusLabel}</div>
                        {record?.session_date && (
                          <div style={{fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'monospace'}}>
                            {record.session_date}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grades View (Dynamically respecting visibility toggles) */}
            {viewMode === 'grades' && (
              <div className="fade-in">
                
                {hasAnyGradeVisible ? (
                  <>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem'}}>
                      {currentSubVis.showQuiz1 && (
                        <div className="panel" style={{background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center', padding: '1.2rem'}}>
                          <span className="text-muted" style={{fontSize: '0.8rem'}}>كويز 1</span>
                          <h3 style={{margin: '6px 0 0 0', fontSize: '1.4rem', color: 'var(--primary-hover)'}}>
                            {currentGrades.quiz_1 || 0}
                          </h3>
                        </div>
                      )}

                      {currentSubVis.showQuiz2 && (
                        <div className="panel" style={{background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center', padding: '1.2rem'}}>
                          <span className="text-muted" style={{fontSize: '0.8rem'}}>كويز 2</span>
                          <h3 style={{margin: '6px 0 0 0', fontSize: '1.4rem', color: 'var(--primary-hover)'}}>
                            {currentGrades.quiz_2 || 0}
                          </h3>
                        </div>
                      )}

                      {currentSubVis.showProject && (
                        <div className="panel" style={{background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center', padding: '1.2rem'}}>
                          <span className="text-muted" style={{fontSize: '0.8rem'}}>المشروع</span>
                          <h3 style={{margin: '6px 0 0 0', fontSize: '1.4rem', color: 'var(--primary-hover)'}}>
                            {currentGrades.project || 0}
                          </h3>
                        </div>
                      )}

                      {currentSubVis.showAttendanceScore && (
                        <div className="panel" style={{background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center', padding: '1.2rem'}}>
                          <span className="text-muted" style={{fontSize: '0.8rem'}}>الحضور</span>
                          <h3 style={{margin: '6px 0 0 0', fontSize: '1.4rem', color: 'var(--success)'}}>
                            {currentGrades.attendance_score || 0}
                          </h3>
                        </div>
                      )}
                    </div>

                    {currentSubVis.showTotal && (
                      <div style={{background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(99, 102, 241, 0.05))', border: '1px solid var(--primary)', borderRadius: '10px', padding: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem'}}>
                        <div>
                          <h3 style={{margin: '0 0 2px 0', fontSize: '1.1rem', color: 'var(--text-main)'}}>المجموع الكلي</h3>
                          <p className="text-muted" style={{margin: 0, fontSize: '0.8rem'}}>مجموع الدرجات المرصودة حالياً</p>
                        </div>
                        <div style={{fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-hover)'}}>
                          {visibleTotal}
                          <span style={{fontSize: '1rem', color: 'var(--text-muted)', marginRight: '4px'}}>درجة</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="panel" style={{textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)'}}>
                    <Award size={36} style={{marginBottom: '0.8rem', opacity: 0.5}} />
                    <h4 style={{margin: 0}}>لم يتم إعلان الدرجات لهذه المادة بعد</h4>
                  </div>
                )}

              </div>
            )}
          </div>
        ) : (
          <div className="panel" style={{textAlign: 'center', padding: '3rem', color: 'var(--text-muted)'}}>
            <BookOpen size={48} style={{marginBottom: '1rem', opacity: 0.5}} />
            <h3>لا توجد مواد مسجلة لهذا الحساب حالياً</h3>
          </div>
        )}

      </main>
    </div>
  );
}
