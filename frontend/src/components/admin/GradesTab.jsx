import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { exportExcelFile, parseExcelFile } from '../../utils/excelHelper';
import { cacheManager } from '../../utils/dataCache';
import { Download, Upload, Save, Users, Filter, BookOpen, AlertCircle } from 'lucide-react';

export default function GradesTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [allAdmins, setAllAdmins] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');
  const [grades, setGrades] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [saveTimeout, setSaveTimeout] = useState(null);

  const normalizeYear = (yr) => {
    if (!yr) return '1';
    return yr.toString()
      .replace('الفرقة ', '')
      .replace('الأولى', '1')
      .replace('الثانية', '2')
      .replace('الثالثة', '3')
      .replace('الرابعة', '4')
      .trim();
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

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const isSuper = !user || user.user_id === 'admin';

      let allUsersList = cacheManager.get('admin_users_base');
      let allSubList = cacheManager.get('admin_subjects_base');

      if (!allUsersList || !allSubList) {
        // Minimum Payload: Single query for users (Eliminating duplicate query completely)
        const [userRes, subRes] = await Promise.all([
          supabase.from('users').select('id, user_id, name, role, year_level, section, assigned_subjects'),
          supabase.from('subjects').select('id, name, year_level, total_weeks, instructor_name, instructor_id, enrolled_students')
        ]);

        allUsersList = userRes.data || [];
        allSubList = subRes.data || [];

        cacheManager.set('admin_users_base', allUsersList);
        cacheManager.set('admin_subjects_base', allSubList);
      }

      const freshCurrentUser = allUsersList.find(u => u.user_id === user.user_id) || user;
      const rawAssigned = Array.isArray(freshCurrentUser?.assigned_subjects) ? freshCurrentUser.assigned_subjects : [];
      const assignedSubIds = rawAssigned.map(entry => entry.split(':')[0]);

      let accessibleSubjects = [];
      if (isSuper) {
        accessibleSubjects = allSubList;
      } else {
        accessibleSubjects = allSubList.filter(s => 
          s.instructor_id === user.user_id || 
          s.instructor_name === user.name || 
          (user.name && s.instructor_name && s.instructor_name.trim().toLowerCase() === user.name.trim().toLowerCase()) ||
          assignedSubIds.includes(s.id)
        );
      }

      setAllAdmins(allUsersList.filter(u => u.role === 'admin'));
      setAllStudents(allUsersList.filter(u => u.role === 'student'));
      setSubjects(accessibleSubjects);

      if (accessibleSubjects.length > 0) {
        const firstSub = accessibleSubjects[0];
        setSelectedSubject(firstSub.id);

        let defaultSec = 'all';
        rawAssigned.forEach(entry => {
          if (entry.startsWith(firstSub.id + ':')) {
            const sec = entry.split(':')[1];
            if (sec && defaultSec === 'all') defaultSec = normalizeSection(sec);
          }
        });
        setSelectedSection(defaultSec);
      }
    } catch (err) {
      console.error('Fetch grades initial data error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSubject) fetchGrades();
  }, [selectedSubject]);

  const fetchGrades = async () => {
    const cacheKey = 'grades_' + selectedSubject;
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      setGrades(cached);
      return;
    }

    // Minimum payload: select ONLY grade fields
    const { data } = await supabase
      .from('grades')
      .select('student_id, quiz_1, quiz_2, project, attendance_score, final_grade')
      .eq('subject_id', selectedSubject);

    const grds = {};
    if (data) {
      data.forEach(g => {
        grds[g.student_id] = {
          quiz_1: g.quiz_1 || 0,
          quiz_2: g.quiz_2 || 0,
          project: g.project || 0,
          attendance_score: g.attendance_score || 0
        };
      });
    }
    setGrades(grds);
    cacheManager.set(cacheKey, grds);
  };

  const displayedSubjects = subjects.filter(s => selectedYear === 'all' || normalizeYear(s.year_level) === selectedYear);

  const handleYearFilterChange = (yr) => {
    setSelectedYear(yr);
    const valid = subjects.filter(s => yr === 'all' || normalizeYear(s.year_level) === yr);
    if (valid.length > 0) setSelectedSubject(valid[0].id);
    else setSelectedSubject('');
  };

  const currentSub = subjects.find(s => s.id === selectedSubject);

  const getEnrolledStudents = () => {
    if (!currentSub) return [];
    if (Array.isArray(currentSub.enrolled_students)) return allStudents.filter(stu => currentSub.enrolled_students.includes(stu.user_id));
    return [];
  };

  const enrolledStudents = getEnrolledStudents();

  const displayedEnrolledStudents = enrolledStudents.filter(stu => {
    if (selectedSection === 'all') return true;
    return getStudentSubSection(stu, selectedSubject) === normalizeSection(selectedSection);
  });

  const getSectionInstructorName = (subId, sec) => {
    for (const adm of allAdmins) {
      if (Array.isArray(adm.assigned_subjects) && adm.assigned_subjects.includes(subId + ':' + sec)) {
        return adm.name;
      }
    }
    if (currentSub?.instructor_name) return currentSub.instructor_name;
    return 'المدير الرئيسي';
  };

  const availableSections = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

    const handleGradeChange = (studentId, field, val) => {
    const num = Math.max(0, parseFloat(val) || 0);
    const currentStudentGrades = grades[studentId] || { quiz_1: 0, quiz_2: 0, project: 0, attendance_score: 0 };
    const updatedStudentGrades = { ...currentStudentGrades, [field]: num };
    const updated = {
      ...grades,
      [studentId]: updatedStudentGrades
    };
    setGrades(updated);
    cacheManager.set('grades_' + selectedSubject, updated);
    cacheManager.invalidate('rep_' + studentId);
    cacheManager.invalidate('student_data_' + studentId);

    // Debounced Auto-Save
    if (saveTimeout) clearTimeout(saveTimeout);
    setAutoSaveStatus('جاري الحفظ...');
    const t = setTimeout(async () => {
      const finalGrade = (updatedStudentGrades.quiz_1 || 0) + (updatedStudentGrades.quiz_2 || 0) + (updatedStudentGrades.project || 0) + (updatedStudentGrades.attendance_score || 0);
      const { error } = await supabase.from('grades').upsert({
        student_id: studentId,
        subject_id: selectedSubject,
        quiz_1: updatedStudentGrades.quiz_1 || 0,
        quiz_2: updatedStudentGrades.quiz_2 || 0,
        project: updatedStudentGrades.project || 0,
        attendance_score: updatedStudentGrades.attendance_score || 0,
        final_grade: finalGrade
      }, { onConflict: 'student_id,subject_id' });

      if (!error) {
        setAutoSaveStatus('✅ تم الحفظ تلقائياً');
        setTimeout(() => setAutoSaveStatus(''), 2000);
      }
    }, 600);
    setSaveTimeout(t);
  };

  const saveGrades = async () => {
    if (!selectedSubject) return;
    setSaving(true);
    setMessage('');

    try {
      const rowsToUpsert = Object.keys(grades).map(studentId => {
        const g = grades[studentId];
        const finalGrade = (g.quiz_1 || 0) + (g.quiz_2 || 0) + (g.project || 0) + (g.attendance_score || 0);
        return {
          student_id: studentId,
          subject_id: selectedSubject,
          quiz_1: g.quiz_1 || 0,
          quiz_2: g.quiz_2 || 0,
          project: g.project || 0,
          attendance_score: g.attendance_score || 0,
          final_grade: finalGrade
        };
      });

      if (rowsToUpsert.length > 0) {
        const { error } = await supabase
          .from('grades')
          .upsert(rowsToUpsert, { onConflict: 'student_id,subject_id' });

        if (error) throw error;
      }

      cacheManager.set('grades_' + selectedSubject, grades);
      Object.keys(grades).forEach(id => {
        cacheManager.invalidate('rep_' + id);
        cacheManager.invalidate('student_data_' + id);
      });
      setMessage('✅ تم حفظ وتأكيد الدرجات بنجاح!');
      setTimeout(() => setMessage(''), 3500);
    } catch (err) {
      console.error('Save grades error:', err);
      setMessage('❌ حدث خطأ أثناء حفظ الدرجات');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!currentSub) return;
    const exportData = displayedEnrolledStudents.map(stu => {
      const g = grades[stu.user_id] || { quiz_1: 0, quiz_2: 0, project: 0, attendance_score: 0 };
      const total = (g.quiz_1 || 0) + (g.quiz_2 || 0) + (g.project || 0) + (g.attendance_score || 0);
      return {
        'ID': stu.user_id,
        'Name': stu.name,
        'Section': getStudentSubSection(stu, selectedSubject),
        'Quiz 1': g.quiz_1 || 0,
        'Quiz 2': g.quiz_2 || 0,
        'Project': g.project || 0,
        'Attendance': g.attendance_score || 0,
        'Total': total
      };
    });

    await exportExcelFile(exportData, 'Grades_' + currentSub.name + (selectedSection !== 'all' ? '_' + selectedSection : '') + '.xlsx');
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedSubject) return;

    setImporting(true);
    setMessage('');
    try {
      const rows = await parseExcelFile(file);
      const newGrades = { ...grades };

      rows.forEach(r => {
        const id = (r['ID'] || r['الرقم الأكاديمي'] || r['الكود'])?.toString().trim();
        if (id) {
          newGrades[id] = {
            quiz_1: parseFloat(r['Quiz 1'] || r['كويز 1'] || 0) || 0,
            quiz_2: parseFloat(r['Quiz 2'] || r['كويز 2'] || 0) || 0,
            project: parseFloat(r['Project'] || r['المشروع'] || 0) || 0,
            attendance_score: parseFloat(r['Attendance'] || r['درجة الحضور'] || 0) || 0
          };
        }
      });

      setGrades(newGrades);
      cacheManager.set('grades_' + selectedSubject, newGrades);
      setMessage('✅ تم استيراد الدرجات من الملف، اضغط "حفظ التعديلات" لتثبيتها');
    } catch (err) {
      console.error(err);
      setMessage('❌ فشل في قراءة ملف الدرجات');
    }
    setImporting(false);
    e.target.value = '';
    setTimeout(() => setMessage(''), 5000);
  };

  if (loading) {
    return <div style={{padding:'3rem',textAlign:'center',color:'var(--text-muted)'}}>جاري تحميل الدرجات التفصيلية...</div>;
  }

  return (
    <div className="fade-in">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'2rem',flexWrap:'wrap',gap:'1rem'}}>
        <div>
          <h2 style={{margin:0,fontSize:'1.6rem',fontWeight:800}}>الدرجات التفصيلية</h2>
          <p className="text-muted" style={{margin:'5px 0 0 0'}}>
            الطلاب المعروضون: <strong>{displayedEnrolledStudents.length} طالب</strong> {selectedSection !== 'all' ? '(سكشن ' + selectedSection + ')' : '(جميع السكاشن)'}
          </p>
        </div>
        <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
          <label className="btn-secondary" style={{cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'8px'}}>
            <Upload size={18} /> استيراد درجات
            <input type="file" accept=".xlsx, .xls" onChange={handleImport} style={{display:'none'}} disabled={importing || !selectedSubject} />
          </label>
          <button className="btn-secondary" onClick={handleExport} disabled={!selectedSubject || displayedEnrolledStudents.length === 0} style={{color:'var(--success)'}}>
            <Download size={18} /> تصدير إكسيل
          </button>
          <button className="btn-primary" onClick={saveGrades} disabled={saving || !selectedSubject} style={{padding:'10px 20px',fontSize:'1rem',fontWeight:700}}>
            <Save size={18} /> {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          background: message.startsWith('✅') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.15)',
          border: message.startsWith('✅') ? '1px solid var(--success)' : '1px solid var(--danger)',
          color: message.startsWith('✅') ? 'var(--success)' : 'var(--danger)',
          padding: '12px 16px', borderRadius: '8px', marginBottom: '1.5rem', fontWeight: 'bold'
        }}>
          {message}
        </div>
      )}

      {/* FILTER BAR WITH SECTION AND TA LABEL */}
      <div className="panel" style={{display:'flex',gap:'1.2rem',marginBottom:'2rem',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:'140px'}}>
          <label style={{display:'block',marginBottom:'8px',fontSize:'0.9rem',color:'var(--primary-hover)',fontWeight:'bold'}}>1. الفرقة:</label>
          <select className="input-field" value={selectedYear} onChange={e => handleYearFilterChange(e.target.value)}>
            <option value="all">جميع الفرق</option>
            <option value="1">الفرقة 1</option>
            <option value="2">الفرقة 2</option>
            <option value="3">الفرقة 3</option>
            <option value="4">الفرقة 4</option>
          </select>
        </div>

        <div style={{flex:1.5,minWidth:'200px'}}>
          <label style={{display:'block',marginBottom:'8px',fontSize:'0.9rem',fontWeight:'bold'}}>2. المادة الدراسية:</label>
          <select className="input-field" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
            {displayedSubjects.length === 0 ? <option value="">-- لا توجد مواد متاحة --</option> : displayedSubjects.map(s => <option key={s.id} value={s.id}>{s.name} (فرقة {normalizeYear(s.year_level)})</option>)}
          </select>
        </div>

        <div style={{flex:1.5,minWidth:'190px'}}>
          <label style={{display:'block',marginBottom:'8px',fontSize:'0.9rem',color:'var(--success)',fontWeight:'bold'}}>3. تصفية السكشن والمعيد:</label>
          <select className="input-field" value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
            <option value="all">جميع سكاشن المادة ({enrolledStudents.length} طالب)</option>
            {availableSections.map(sec => {
              const taName = selectedSubject ? getSectionInstructorName(selectedSubject, sec) : '';
              return (
                <option key={sec} value={sec}>
                  سكشن {sec} {taName ? '(' + taName + ')' : ''}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {selectedSubject && (
        <div className="panel" style={{padding:0,overflowX:'auto'}}>
          <table className="table" style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'rgba(255,255,255,0.02)',borderBottom:'1px solid var(--border)',textAlign:'right'}}>
                <th style={{padding:'14px 16px'}}>الرقم الأكاديمي</th>
                <th style={{padding:'14px 16px'}}>اسم الطالب</th>
                <th style={{padding:'14px 16px'}}>السكشن</th>
                <th style={{padding:'14px 16px',textAlign:'center'}}>كويز 1</th>
                <th style={{padding:'14px 16px',textAlign:'center'}}>كويز 2</th>
                <th style={{padding:'14px 16px',textAlign:'center'}}>المشروع</th>
                <th style={{padding:'14px 16px',textAlign:'center'}}>درجة الحضور</th>
                <th style={{padding:'14px 16px',textAlign:'center'}}>المجموع</th>
              </tr>
            </thead>
            <tbody>
              {displayedEnrolledStudents.map(stu => {
                const g = grades[stu.user_id] || { quiz_1: 0, quiz_2: 0, project: 0, attendance_score: 0 };
                const total = (g.quiz_1 || 0) + (g.quiz_2 || 0) + (g.project || 0) + (g.attendance_score || 0);
                return (
                  <tr key={stu.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'14px 16px',fontWeight:'bold'}}>{stu.user_id}</td>
                    <td style={{padding:'14px 16px'}}>{stu.name}</td>
                    <td style={{padding:'14px 16px'}}>
                      <span className="badge" style={{background:'rgba(16, 185, 129, 0.1)',color:'var(--success)',border:'1px solid rgba(16, 185, 129, 0.2)'}}>
                        {getStudentSubSection(stu, selectedSubject)}
                      </span>
                    </td>
                    <td style={{padding:'10px 14px',textAlign:'center'}}>
                      <input type="number" className="input-field" style={{width:'80px',textAlign:'center',padding:'6px'}} value={g.quiz_1} onChange={e=>handleGradeChange(stu.user_id,'quiz_1',e.target.value)} />
                    </td>
                    <td style={{padding:'10px 14px',textAlign:'center'}}>
                      <input type="number" className="input-field" style={{width:'80px',textAlign:'center',padding:'6px'}} value={g.quiz_2} onChange={e=>handleGradeChange(stu.user_id,'quiz_2',e.target.value)} />
                    </td>
                    <td style={{padding:'10px 14px',textAlign:'center'}}>
                      <input type="number" className="input-field" style={{width:'80px',textAlign:'center',padding:'6px'}} value={g.project} onChange={e=>handleGradeChange(stu.user_id,'project',e.target.value)} />
                    </td>
                    <td style={{padding:'10px 14px',textAlign:'center'}}>
                      <input type="number" className="input-field" style={{width:'80px',textAlign:'center',padding:'6px'}} value={g.attendance_score} onChange={e=>handleGradeChange(stu.user_id,'attendance_score',e.target.value)} />
                    </td>
                    <td style={{padding:'14px 16px',textAlign:'center',fontWeight:'bold',color:'var(--primary-hover)',fontSize:'1.1rem'}}>
                      {total}
                    </td>
                  </tr>
                );
              })}
              {displayedEnrolledStudents.length === 0 && (
                <tr>
                  <td colSpan="8" style={{textAlign:'center',padding:'3rem',color:'var(--text-muted)'}}>
                    لا يوجد طلاب يطابقون التصفية في هذه المادة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
