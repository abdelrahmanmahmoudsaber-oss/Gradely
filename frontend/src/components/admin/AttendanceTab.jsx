import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { exportExcelFile } from '../../utils/excelHelper';
import { cacheManager } from '../../utils/dataCache';
import { 
  Download, Users, UserPlus, UserMinus, UserCheck, CheckSquare, 
  FileText, Filter, Calendar, Save, Search, CheckCircle2, XCircle, 
  Clock, AlertCircle, LayoutGrid, List, RotateCcw, Copy, Check, MessageSquare
} from 'lucide-react';

export default function AttendanceTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [allAdmins, setAllAdmins] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');
  const [week, setWeek] = useState(1);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [excuseReasons, setExcuseReasons] = useState({});
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [message, setMessage] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'
  const [copiedTxt, setCopiedTxt] = useState(false);

  // Excuse Modal
  const [excuseModalStudent, setExcuseModalStudent] = useState(null);
  const [excuseInputText, setExcuseInputText] = useState('');
  
  // Custom enrollment states
  const [showManageStudents, setShowManageStudents] = useState(false);
  const [enrollMode, setEnrollMode] = useState('multi');
  const [filterYearToAdd, setFilterYearToAdd] = useState('1');
  const [filterSectionToAdd, setFilterSectionToAdd] = useState('all');
  const [selectedStudentToAdd, setSelectedStudentToAdd] = useState('');
  const [selectedStudentsList, setSelectedStudentsList] = useState([]);
  const [pastedIds, setPastedIds] = useState('');

  const isSuper = !user || user.user_id === 'admin';

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

      let allUsersList = cacheManager.get('admin_users_base');
      let allSubList = cacheManager.get('admin_subjects_base');

      if (!allUsersList || !allSubList) {
        const [userRes, subRes] = await Promise.all([
          supabase.from('users').select('id, user_id, name, role, year_level, section, assigned_subjects'),
          supabase.from('subjects').select('id, name, year_level, total_weeks, instructor_name, instructor_id, enrolled_students, excluded_students')
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
        accessibleSubjects = allSubList.filter(s => s.instructor_id === user.user_id || assignedSubIds.includes(s.id));
      }

      setAllAdmins(allUsersList.filter(u => u.role === 'admin'));
      setAllStudents(allUsersList.filter(u => u.role === 'student'));
      setSubjects(accessibleSubjects);

      if (accessibleSubjects.length > 0) {
        const firstSub = accessibleSubjects[0];
        setSelectedSubject(firstSub.id);
        setFilterYearToAdd(normalizeYear(firstSub.year_level));

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
      console.error('Fetch initial data error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSubject) {
      fetchAttendance();
      setSelectedStudentsList([]);
      setPastedIds('');
    }
  }, [selectedSubject, week]);

  const fetchAttendance = async () => {
    const cacheKey = 'att_' + selectedSubject + '_w' + week;
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      setAttendanceRecords(cached.records || {});
      setExcuseReasons(cached.excuses || {});
      if (cached.date) setSessionDate(cached.date);
      return;
    }

    const { data } = await supabase
      .from('attendance')
      .select('student_id, status, session_date, excuse_reason')
      .eq('subject_id', selectedSubject)
      .eq('week_number', week);

    const recs = {};
    const excuses = {};
    let foundDate = sessionDate;

    if (data && data.length > 0) {
      data.forEach(r => { 
        recs[r.student_id] = r.status;
        if (r.excuse_reason) excuses[r.student_id] = r.excuse_reason;
        if (r.session_date) foundDate = r.session_date;
      });
    }

    setAttendanceRecords(recs);
    setExcuseReasons(excuses);
    if (foundDate) setSessionDate(foundDate);
    cacheManager.set(cacheKey, { records: recs, excuses, date: foundDate });
  };

  const displayedSubjects = subjects.filter(s => selectedYear === 'all' || normalizeYear(s.year_level) === selectedYear);

  const handleYearFilterChange = (yr) => {
    setSelectedYear(yr);
    const valid = subjects.filter(s => yr === 'all' || normalizeYear(s.year_level) === yr);
    if (valid.length > 0) { 
      setSelectedSubject(valid[0].id); 
      setFilterYearToAdd(normalizeYear(valid[0].year_level)); 
    } else {
      setSelectedSubject('');
    }
  };

  const currentSub = subjects.find(s => s.id === selectedSubject);

  const getEnrolledStudents = () => {
    if (!currentSub) return [];
    if (Array.isArray(currentSub.enrolled_students)) return allStudents.filter(stu => currentSub.enrolled_students.includes(stu.user_id));
    return [];
  };

  const enrolledStudents = getEnrolledStudents();

  const displayedEnrolledStudents = enrolledStudents
    .filter(stu => {
      if (selectedSection === 'all') return true;
      return normalizeSection(stu.section || 'S1') === normalizeSection(selectedSection);
    })
    .filter(stu => {
      if (!studentSearch.trim()) return true;
      const q = studentSearch.toLowerCase().trim();
      return stu.name.toLowerCase().includes(q) || stu.user_id.toLowerCase().includes(q);
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

  const handleExcludeStudent = async (studentId, studentName) => {
    if (!isSuper) {
      alert('عذراً، إدارة واستبعاد طلاب المادة صلاحية خاصة بالمدير الرئيسي فقط.');
      return;
    }
    if (!window.confirm('هل أنت متأكد من حذف الطالب (' + studentName + ') من هذه المادة فقط؟')) return;
    const currentEnrolled = Array.isArray(currentSub.enrolled_students) ? currentSub.enrolled_students : [];
    const updatedEnrolled = currentEnrolled.filter(id => id !== studentId);
    const { error } = await supabase.from('subjects').update({ enrolled_students: updatedEnrolled }).eq('id', currentSub.id);
    if (!error) {
      setSubjects(prev => prev.map(s => s.id === currentSub.id ? { ...s, enrolled_students: updatedEnrolled } : s));
      cacheManager.invalidate('admin_subjects_base');
    }
  };

  const handleAddCustomStudent = async () => {
    if (!selectedStudentToAdd) return;
    const currentEnrolled = Array.isArray(currentSub.enrolled_students) ? currentSub.enrolled_students : [];
    const updatedEnrolled = [...new Set([...currentEnrolled, selectedStudentToAdd])];
    const { error } = await supabase.from('subjects').update({ enrolled_students: updatedEnrolled }).eq('id', currentSub.id);
    if (!error) { 
      setSubjects(prev => prev.map(s => s.id === currentSub.id ? { ...s, enrolled_students: updatedEnrolled } : s)); 
      setSelectedStudentToAdd('');
      cacheManager.invalidate('admin_subjects_base');
    }
  };

  const handleAddMultipleStudents = async () => {
    if (selectedStudentsList.length === 0) return;
    const currentEnrolled = Array.isArray(currentSub.enrolled_students) ? currentSub.enrolled_students : [];
    const updatedEnrolled = [...new Set([...currentEnrolled, ...selectedStudentsList])];
    const { error } = await supabase.from('subjects').update({ enrolled_students: updatedEnrolled }).eq('id', currentSub.id);
    if (!error) {
      setSubjects(prev => prev.map(s => s.id === currentSub.id ? { ...s, enrolled_students: updatedEnrolled } : s));
      alert('تمت إضافة ' + selectedStudentsList.length + ' طالب إلى المادة بنجاح!');
      setSelectedStudentsList([]);
      cacheManager.invalidate('admin_subjects_base');
    }
  };

  const handleAddPastedIds = async () => {
    if (!pastedIds.trim()) return;
    const parsedIds = pastedIds.split(/[\r\n,;\s]+/).map(x => x.trim()).filter(Boolean);
    if (parsedIds.length === 0) return;

    const matchedStudents = allStudents.filter(s => parsedIds.includes(s.user_id)).map(s => s.user_id);
    if (matchedStudents.length === 0) {
      alert('لم يتم العثور على أي طلاب يطابقون أرقام الجلوس المكتوبة!');
      return;
    }

    const currentEnrolled = Array.isArray(currentSub.enrolled_students) ? currentSub.enrolled_students : [];
    const updatedEnrolled = [...new Set([...currentEnrolled, ...matchedStudents])];
    const { error } = await supabase.from('subjects').update({ enrolled_students: updatedEnrolled }).eq('id', currentSub.id);
    if (!error) {
      setSubjects(prev => prev.map(s => s.id === currentSub.id ? { ...s, enrolled_students: updatedEnrolled } : s));
      alert('تمت مطابقة وإضافة ' + matchedStudents.length + ' طالب من أصل ' + parsedIds.length + ' رقم جلوس مكتوب!');
      setPastedIds('');
      cacheManager.invalidate('admin_subjects_base');
    }
  };

  const handleAddAllYearStudents = async () => {
    if (!currentSub) return;
    const subYr = normalizeYear(currentSub.year_level);
    const yearStudentsIds = allStudents.filter(s => normalizeYear(s.year_level) === subYr).map(s => s.user_id);
    const currentEnrolled = Array.isArray(currentSub.enrolled_students) ? currentSub.enrolled_students : [];
    const updatedEnrolled = [...new Set([...currentEnrolled, ...yearStudentsIds])];
    const { error } = await supabase.from('subjects').update({ enrolled_students: updatedEnrolled }).eq('id', currentSub.id);
    if (!error) {
      setSubjects(prev => prev.map(s => s.id === currentSub.id ? { ...s, enrolled_students: updatedEnrolled } : s));
      alert('تمت إضافة جميع طلاب الفرقة ' + subYr + ' (' + yearStudentsIds.length + ' طالب) إلى المادة بنجاح!');
      cacheManager.invalidate('admin_subjects_base');
    }
  };

  // Instant Auto-Save on Toggle
  const toggleAttendance = (studentId, newStatus) => {
    const currentVal = attendanceRecords[studentId];
    const nextVal = currentVal === newStatus ? null : newStatus;
    
    // If setting to excused, open excuse prompt
    if (nextVal === 'excused') {
      const studentObj = allStudents.find(s => s.user_id === studentId);
      setExcuseModalStudent(studentObj || { user_id: studentId, name: studentId });
      setExcuseInputText(excuseReasons[studentId] || '');
    }

    const updatedRecs = { ...attendanceRecords, [studentId]: nextVal };
    setAttendanceRecords(updatedRecs);
    cacheManager.set('att_' + selectedSubject + '_w' + week, { records: updatedRecs, excuses: excuseReasons, date: sessionDate });
    
    setAutoSaveStatus('جاري الحفظ...');
    supabase.from('attendance').upsert({
      student_id: studentId,
      subject_id: selectedSubject,
      week_number: week,
      status: nextVal || 'unrecorded',
      session_date: sessionDate,
      excuse_reason: nextVal === 'excused' ? (excuseReasons[studentId] || null) : null
    }, { onConflict: 'student_id,subject_id,week_number' }).then(({ error }) => {
      if (!error) {
        setAutoSaveStatus('✅ تم الحفظ تلقائياً');
        setTimeout(() => setAutoSaveStatus(''), 2000);
        cacheManager.invalidate('rep_' + studentId);
      }
    });
  };

  const handleSaveExcuseReason = () => {
    if (!excuseModalStudent) return;
    const sId = excuseModalStudent.user_id;
    const updatedExcuses = { ...excuseReasons, [sId]: excuseInputText.trim() };
    setExcuseReasons(updatedExcuses);
    cacheManager.set('att_' + selectedSubject + '_w' + week, { records: attendanceRecords, excuses: updatedExcuses, date: sessionDate });

    supabase.from('attendance').upsert({
      student_id: sId,
      subject_id: selectedSubject,
      week_number: week,
      status: 'excused',
      session_date: sessionDate,
      excuse_reason: excuseInputText.trim() || null
    }, { onConflict: 'student_id,subject_id,week_number' }).then(() => {
      cacheManager.invalidate('rep_' + sId);
    });

    setExcuseModalStudent(null);
    setExcuseInputText('');
  };

  const handleMarkAllPresent = () => {
    const updated = { ...attendanceRecords };
    displayedEnrolledStudents.forEach(stu => {
      updated[stu.user_id] = 'present';
    });
    setAttendanceRecords(updated);
    cacheManager.set('att_' + selectedSubject + '_w' + week, { records: updated, excuses: excuseReasons, date: sessionDate });

    const rows = displayedEnrolledStudents.map(stu => ({
      student_id: stu.user_id,
      subject_id: selectedSubject,
      week_number: week,
      status: 'present',
      session_date: sessionDate
    }));

    setAutoSaveStatus('جاري الحفظ...');
    supabase.from('attendance').upsert(rows, { onConflict: 'student_id,subject_id,week_number' }).then(() => {
      setAutoSaveStatus('✅ تم حفظ الكل كـ حاضر');
      setTimeout(() => setAutoSaveStatus(''), 2500);
    });
  };

  const handleResetCurrentAttendance = () => {
    if (!window.confirm('هل تريد إلغاء تحديد الحضور لكافة الطلاب المعروضين في هذا الأسبوع؟')) return;
    const updated = { ...attendanceRecords };
    displayedEnrolledStudents.forEach(stu => {
      delete updated[stu.user_id];
    });
    setAttendanceRecords(updated);
    cacheManager.set('att_' + selectedSubject + '_w' + week, { records: updated, excuses: excuseReasons, date: sessionDate });

    const rows = displayedEnrolledStudents.map(stu => ({
      student_id: stu.user_id,
      subject_id: selectedSubject,
      week_number: week,
      status: 'unrecorded',
      session_date: sessionDate
    }));
    supabase.from('attendance').upsert(rows, { onConflict: 'student_id,subject_id,week_number' });
  };

  // Quick Copy Clean TXT / Clipboard Export
  const handleCopyCleanTxt = () => {
    const subName = currentSub ? currentSub.name : 'مادة';
    const yr = currentSub ? normalizeYear(currentSub.year_level) : '';
    const secName = selectedSection !== 'all' ? selectedSection : 'جميع السكاشن';
    const taName = currentSub ? getSectionInstructorName(selectedSubject, selectedSection) : '';

    const presentList = displayedEnrolledStudents.filter(s => attendanceRecords[s.user_id] === 'present');
    const absentList = displayedEnrolledStudents.filter(s => attendanceRecords[s.user_id] === 'absent');
    const lateList = displayedEnrolledStudents.filter(s => attendanceRecords[s.user_id] === 'late');
    const excusedList = displayedEnrolledStudents.filter(s => attendanceRecords[s.user_id] === 'excused');

    let txt = `كشف حضور وغياب — مادة: ${subName} (الفرقة ${yr})\n`;
    txt += `السكشن: ${secName} | المشرف/المعيد: ${taName}\n`;
    txt += `رقم الأسبوع: الأسبوع ${week} | التاريخ: ${sessionDate}\n`;
    txt += `--------------------------------------------------\n`;
    txt += `إجمالي الحضور: ${presentList.length} | الغياب: ${absentList.length} | التأخير: ${lateList.length} | الأعذار: ${excusedList.length}\n\n`;

    txt += `✅ الطلاب الحاضرون (${presentList.length}):\n`;
    presentList.forEach((s, i) => {
      txt += `${i + 1}. [${s.user_id}] ${s.name} - سكشن ${normalizeSection(s.section || 'S1')}\n`;
    });

    if (absentList.length > 0) {
      txt += `\n❌ الطلاب الغائبون (${absentList.length}):\n`;
      absentList.forEach((s, i) => {
        txt += `${i + 1}. [${s.user_id}] ${s.name} - سكشن ${normalizeSection(s.section || 'S1')}\n`;
      });
    }

    if (lateList.length > 0) {
      txt += `\n⏰ الطلاب المتأخرون (${lateList.length}):\n`;
      lateList.forEach((s, i) => {
        txt += `${i + 1}. [${s.user_id}] ${s.name}\n`;
      });
    }

    if (excusedList.length > 0) {
      txt += `\n📄 أصحاب الأعذار (${excusedList.length}):\n`;
      excusedList.forEach((s, i) => {
        const rsn = excuseReasons[s.user_id] ? ` (السبب: ${excuseReasons[s.user_id]})` : '';
        txt += `${i + 1}. [${s.user_id}] ${s.name}${rsn}\n`;
      });
    }

    navigator.clipboard.writeText(txt).then(() => {
      setCopiedTxt(true);
      setTimeout(() => setCopiedTxt(false), 3000);
    });
  };

  const handleExport = async () => {
    if (!currentSub) return;
    const { data: allAttendance } = await supabase
      .from('attendance')
      .select('student_id, week_number, status, session_date, excuse_reason')
      .eq('subject_id', selectedSubject);
    
    const exportData = displayedEnrolledStudents.map(stu => {
      const row = { 'ID': stu.user_id, 'Name': stu.name, 'Section': normalizeSection(stu.section || 'S1') };
      const stuAtt = allAttendance ? allAttendance.filter(a => a.student_id === stu.user_id) : [];
      let totalAttended = 0;
      let totalAbsent = 0;

      for (let w = 1; w <= (currentSub.total_weeks || 12); w++) {
        row['Week ' + w] = '';
      }

      stuAtt.forEach(a => {
        const dateNote = a.session_date ? ` (${a.session_date})` : '';
        if (a.status === 'present') {
          row['Week ' + a.week_number] = '1' + dateNote;
          totalAttended++;
        } else if (a.status === 'late') {
          row['Week ' + a.week_number] = 'تأخير' + dateNote;
          totalAttended++;
        } else if (a.status === 'absent') {
          row['Week ' + a.week_number] = '0' + dateNote;
          totalAbsent++;
        } else if (a.status === 'excused') {
          row['Week ' + a.week_number] = (a.excuse_reason ? `عذر: ${a.excuse_reason}` : 'عذر') + dateNote;
        }
      });

      row['إجمالي الحضور (Total Present)'] = String(totalAttended);
      row['إجمالي الغياب (Total Absence)'] = String(totalAbsent);
      return row;
    });

    await exportExcelFile(exportData, 'Attendance_' + currentSub.name + (selectedSection !== 'all' ? '_' + selectedSection : '') + '.xlsx');
  };

  const candidateStudents = allStudents.filter(s => 
    normalizeYear(s.year_level) === filterYearToAdd && 
    (filterSectionToAdd === 'all' || normalizeSection(s.section || 'S1') === normalizeSection(filterSectionToAdd)) &&
    !enrolledStudents.some(e => e.user_id === s.user_id)
  );

  const toggleSelectAllCandidates = () => {
    if (selectedStudentsList.length === candidateStudents.length) {
      setSelectedStudentsList([]);
    } else {
      setSelectedStudentsList(candidateStudents.map(s => s.user_id));
    }
  };

  // Realtime counters for currently displayed students
  let countPresent = 0;
  let countAbsent = 0;
  let countLate = 0;
  let countExcused = 0;
  displayedEnrolledStudents.forEach(stu => {
    const st = attendanceRecords[stu.user_id];
    if (st === 'present') countPresent++;
    else if (st === 'absent') countAbsent++;
    else if (st === 'late') countLate++;
    else if (st === 'excused') countExcused++;
  });
  const countUnrecorded = displayedEnrolledStudents.length - (countPresent + countAbsent + countLate + countExcused);

  if (loading) {
    return <div style={{padding:'3rem',textAlign:'center',color:'var(--text-muted)'}}>جاري تحميل سجل الغياب...</div>;
  }

  return (
    <div className="fade-in">
      {/* Top Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'1rem'}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <h2 style={{margin:0,fontSize:'1.6rem',fontWeight:800}}>سجل الغياب الأسبوعي</h2>
            {autoSaveStatus && (
              <span style={{fontSize:'0.85rem',color: autoSaveStatus.startsWith('✅') ? 'var(--success)' : 'var(--primary-hover)',fontWeight:700}}>
                {autoSaveStatus}
              </span>
            )}
          </div>
          <p className="text-muted" style={{margin:'5px 0 0 0'}}>
            الطلاب المعروضون: <strong>{displayedEnrolledStudents.length} طالب</strong> {selectedSection !== 'all' ? '(سكشن ' + selectedSection + ')' : '(جميع السكاشن)'}
          </p>
        </div>
        <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
          {/* Manage Students button is strictly for Super Admin */}
          {isSuper && (
            <button className="btn-secondary" onClick={() => setShowManageStudents(!showManageStudents)}>
              <Users size={18} /> {showManageStudents ? 'إغلاق إدارة الطلاب' : 'إدارة وتسجيل طلاب المادة'}
            </button>
          )}

          <button 
            className="btn-secondary" 
            onClick={handleCopyCleanTxt} 
            disabled={!selectedSubject || displayedEnrolledStudents.length === 0}
            style={{color:'var(--primary-hover)',borderColor:'rgba(79, 70, 229, 0.4)'}}
            title="نسخ كشف الحضور والغياب بصيغة نصية مرتبة لتقديمها مباشرة"
          >
            {copiedTxt ? <Check size={18} style={{color:'var(--success)'}} /> : <Copy size={18} />}
            {copiedTxt ? 'تم نسخ الكشف ✓' : 'نسخ الكشف (TXT)'}
          </button>

          <button className="btn-secondary" onClick={handleExport} disabled={!selectedSubject || displayedEnrolledStudents.length === 0} style={{color:'var(--success)'}}>
            <Download size={18} /> تصدير إكسيل
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
      <div className="panel" style={{display:'flex',gap:'1.2rem',marginBottom:'1.5rem',flexWrap:'wrap',alignItems:'flex-end'}}>
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
          <select className="input-field" value={selectedSubject} onChange={e => { setSelectedSubject(e.target.value); const sub = subjects.find(s => s.id === e.target.value); if (sub) setFilterYearToAdd(normalizeYear(sub.year_level)); }}>
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

        {currentSub && (
          <div style={{flex:1,minWidth:'130px'}}>
            <label style={{display:'block',marginBottom:'8px',fontSize:'0.9rem',fontWeight:'bold'}}>4. رقم الأسبوع:</label>
            <select className="input-field" value={week} onChange={e => setWeek(Number(e.target.value))}>
              {Array.from({length:currentSub.total_weeks || 12},(_,i)=>i+1).map(w=><option key={w} value={w}>الأسبوع {w}</option>)}
            </select>
          </div>
        )}

        <div style={{flex:1.2,minWidth:'160px'}}>
          <label style={{display:'block',marginBottom:'8px',fontSize:'0.9rem',fontWeight:'bold',color:'var(--primary-hover)'}}>
            5. تاريخ المحاضرة:
          </label>
          <input 
            type="date" 
            className="input-field" 
            value={sessionDate} 
            onChange={e => {
              setSessionDate(e.target.value);
              // Update date for existing week's attendance in background
              supabase.from('attendance').update({ session_date: e.target.value }).eq('subject_id', selectedSubject).eq('week_number', week);
            }} 
          />
        </div>
      </div>

      {/* QUICK ATTENDANCE TOOLBAR & LIVE COUNTERS */}
      {selectedSubject && (
        <div className="panel" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'1rem',background:'var(--surface)',padding:'1rem 1.2rem'}}>
          
          {/* Quick Search */}
          <div style={{position:'relative',minWidth:'220px',flex:1}}>
            <Search size={16} style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}} />
            <input 
              type="text" 
              className="input-field" 
              placeholder="بحث سريع بالاسم أو الرقم..." 
              value={studentSearch} 
              onChange={e=>setStudentSearch(e.target.value)}
              style={{paddingRight:'34px',paddingTop:'7px',paddingBottom:'7px',fontSize:'0.9rem'}}
            />
          </div>

          {/* Quick Status Counters */}
          <div style={{display:'flex',gap:'12px',alignItems:'center',fontSize:'0.85rem',fontWeight:700,flexWrap:'wrap'}}>
            <span style={{color:'var(--success)',background:'rgba(16, 185, 129, 0.1)',padding:'4px 8px',borderRadius:'6px',border:'1px solid rgba(16, 185, 129, 0.2)'}}>
              ● حاضر: {countPresent}
            </span>
            <span style={{color:'var(--danger)',background:'rgba(239, 68, 68, 0.1)',padding:'4px 8px',borderRadius:'6px',border:'1px solid rgba(239, 68, 68, 0.2)'}}>
              ● غائب: {countAbsent}
            </span>
            <span style={{color:'var(--warning)',background:'rgba(245, 158, 11, 0.1)',padding:'4px 8px',borderRadius:'6px',border:'1px solid rgba(245, 158, 11, 0.2)'}}>
              ● تأخير: {countLate}
            </span>
            <span style={{color:'#3b82f6',background:'rgba(59, 130, 246, 0.1)',padding:'4px 8px',borderRadius:'6px',border:'1px solid rgba(59, 130, 246, 0.2)'}}>
              ● عذر: {countExcused}
            </span>
            {countUnrecorded > 0 && (
              <span style={{color:'var(--text-muted)',background:'var(--bg)',padding:'4px 8px',borderRadius:'6px',border:'1px solid var(--border)'}}>
                لم يرصد: {countUnrecorded}
              </span>
            )}
          </div>

          {/* Quick Actions & View Switcher */}
          <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
            <button 
              className="btn-secondary" 
              onClick={handleMarkAllPresent}
              style={{color:'var(--success)',borderColor:'rgba(16, 185, 129, 0.4)',fontSize:'0.85rem',padding:'6px 12px'}}
              title="تعيين جميع الطلاب المعروضين كـ حاضر دفعة واحدة"
            >
              <CheckCircle2 size={15} /> تحضير الكل
            </button>
            <button 
              className="btn-secondary" 
              onClick={handleResetCurrentAttendance}
              style={{color:'var(--text-muted)',fontSize:'0.85rem',padding:'6px 10px'}}
              title="إعادة تعيين وإلغاء تحديد الحضور"
            >
              <RotateCcw size={15} />
            </button>

            {/* View Mode Toggle */}
            <div style={{display:'flex',gap:'2px',background:'var(--bg)',padding:'2px',borderRadius:'6px',border:'1px solid var(--border)'}}>
              <button 
                onClick={()=>setViewMode('cards')}
                style={{
                  background: viewMode === 'cards' ? 'var(--primary)' : 'transparent',
                  color: viewMode === 'cards' ? '#fff' : 'var(--text-muted)',
                  border:'none',padding:'5px 8px',borderRadius:'4px',cursor:'pointer',display:'flex'
                }}
                title="عرض الكروت"
              >
                <LayoutGrid size={16} />
              </button>
              <button 
                onClick={()=>setViewMode('table')}
                style={{
                  background: viewMode === 'table' ? 'var(--primary)' : 'transparent',
                  color: viewMode === 'table' ? '#fff' : 'var(--text-muted)',
                  border:'none',padding:'5px 8px',borderRadius:'4px',cursor:'pointer',display:'flex'
                }}
                title="عرض القائمة والجدول السريع"
              >
                <List size={16} />
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ENROLLMENT MANAGEMENT PANEL (Super Admin Only) */}
      {isSuper && showManageStudents && currentSub && (
        <div className="panel fade-in" style={{marginBottom:'2rem',border:'1px solid var(--primary)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',flexWrap:'wrap',gap:'1rem'}}>
            <h3 style={{display:'flex',alignItems:'center',gap:'8px',color:'var(--primary-hover)',margin:0}}>
              <Users size={20} /> تسجيل وإضافة طلاب للمادة ({currentSub.name})
            </h3>
            <button className="btn-secondary" onClick={handleAddAllYearStudents} style={{fontSize:'0.85rem',color:'var(--primary-hover)'}}>
              <UserCheck size={16} /> إضافة كل طلاب الفرقة {normalizeYear(currentSub.year_level)} دفعة واحدة
            </button>
          </div>

          <div style={{display:'flex',gap:'10px',marginBottom:'1.2rem',borderBottom:'1px solid var(--border)',paddingBottom:'0.8rem'}}>
            <button 
              onClick={() => setEnrollMode('multi')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px',
                fontSize: '0.95rem', fontWeight: enrollMode === 'multi' ? 'bold' : 'normal',
                color: enrollMode === 'multi' ? 'var(--primary-hover)' : 'var(--text-muted)',
                borderBottom: enrollMode === 'multi' ? '2px solid var(--primary)' : 'none',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <CheckSquare size={16} /> تحديد مجموعة طلاب (Checklist)
            </button>
            <button 
              onClick={() => setEnrollMode('paste')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px',
                fontSize: '0.95rem', fontWeight: enrollMode === 'paste' ? 'bold' : 'normal',
                color: enrollMode === 'paste' ? 'var(--primary-hover)' : 'var(--text-muted)',
                borderBottom: enrollMode === 'paste' ? '2px solid var(--primary)' : 'none',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <FileText size={16} /> كتابة / لصق أرقام الجلوس دفعة واحدة
            </button>
            <button 
              onClick={() => setEnrollMode('single')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px',
                fontSize: '0.95rem', fontWeight: enrollMode === 'single' ? 'bold' : 'normal',
                color: enrollMode === 'single' ? 'var(--primary-hover)' : 'var(--text-muted)',
                borderBottom: enrollMode === 'single' ? '2px solid var(--primary)' : 'none',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <UserPlus size={16} /> اختيار فردي من القائمة
            </button>
          </div>

          {enrollMode === 'multi' && (
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px',flexWrap:'wrap',gap:'10px'}}>
                <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}}>
                  <label style={{fontSize:'0.9rem',fontWeight:'bold'}}>الفرقة:</label>
                  <select className="input-field" value={filterYearToAdd} onChange={e => { setFilterYearToAdd(e.target.value); setSelectedStudentsList([]); }} style={{padding:'6px 12px',width:'auto'}}>
                    <option value="1">الفرقة 1</option>
                    <option value="2">الفرقة 2</option>
                    <option value="3">الفرقة 3</option>
                    <option value="4">الفرقة 4</option>
                  </select>
                  <label style={{fontSize:'0.9rem',fontWeight:'bold'}}>السكشن:</label>
                  <select className="input-field" value={filterSectionToAdd} onChange={e => { setFilterSectionToAdd(e.target.value); setSelectedStudentsList([]); }} style={{padding:'6px 12px',width:'auto'}}>
                    <option value="all">جميع السكاشن</option>
                    <option value="S1">S1</option>
                    <option value="S2">S2</option>
                    <option value="S3">S3</option>
                    <option value="S4">S4</option>
                    <option value="S5">S5</option>
                  </select>
                </div>
                <div style={{display:'flex',gap:'10px'}}>
                  <button className="btn-secondary" onClick={toggleSelectAllCandidates} style={{fontSize:'0.85rem'}}>
                    {selectedStudentsList.length === candidateStudents.length && candidateStudents.length > 0 ? 'إلغاء تحديد الكل' : 'تحديد كل المتاح (' + candidateStudents.length + ')'}
                  </button>
                  <button className="btn-primary" onClick={handleAddMultipleStudents} disabled={selectedStudentsList.length === 0} style={{fontSize:'0.85rem'}}>
                    <UserPlus size={16} /> إضافة المحددين ({selectedStudentsList.length}) للمادة
                  </button>
                </div>
              </div>

              <div style={{maxHeight:'240px',overflowY:'auto',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'8px',padding:'10px'}}>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))',gap:'8px'}}>
                  {candidateStudents.map(s => {
                    const isChecked = selectedStudentsList.includes(s.user_id);
                    return (
                      <label key={s.id} style={{
                        display:'flex',alignItems:'center',gap:'8px',padding:'8px 10px',
                        background: isChecked ? 'rgba(79, 70, 229, 0.15)' : 'var(--surface)',
                        border: isChecked ? '1px solid var(--primary)' : '1px solid var(--border)',
                        borderRadius:'6px',cursor:'pointer',transition:'all 0.15s'
                      }}>
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedStudentsList([...selectedStudentsList, s.user_id]);
                            else setSelectedStudentsList(selectedStudentsList.filter(id => id !== s.user_id));
                          }}
                        />
                        <span style={{fontSize:'0.9rem',fontWeight: isChecked ? 'bold' : 'normal'}}>
                          {s.name} ({s.user_id}) - <strong style={{color:'var(--success)'}}>{normalizeSection(s.section || 'S1')}</strong>
                        </span>
                      </label>
                    );
                  })}
                  {candidateStudents.length === 0 && (
                    <div style={{gridColumn:'1 / -1',textAlign:'center',padding:'1.5rem',color:'var(--text-muted)'}}>
                      لا يوجد طلاب متاحين في هذه الفرقة/السكشن للإضافة
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {enrollMode === 'paste' && (
            <div>
              <p className="text-muted" style={{fontSize:'0.85rem',marginBottom:'8px'}}>
                اكتب أو الصق أرقام الجلوس (IDs) للطلاب معاً في الصندوق أدناه:
              </p>
              <textarea 
                className="input-field" 
                rows="4" 
                placeholder="2024101&#10;2024102&#10;2024103..." 
                value={pastedIds} 
                onChange={e => setPastedIds(e.target.value)}
                style={{width:'100%',padding:'10px',fontFamily:'monospace',fontSize:'0.95rem',marginBottom:'10px'}}
              />
              <button className="btn-primary" onClick={handleAddPastedIds} disabled={!pastedIds.trim()}>
                <UserPlus size={16} /> مطابقة وإضافة أرقام الجلوس للمادة
              </button>
            </div>
          )}

          {enrollMode === 'single' && (
            <div style={{display:'flex',gap:'1rem',alignItems:'flex-end',flexWrap:'wrap'}}>
              <div style={{width:'160px'}}>
                <label style={{display:'block',marginBottom:'8px',fontSize:'0.9rem'}}>1. الفرقة الدراسية:</label>
                <select className="input-field" value={filterYearToAdd} onChange={e => { setFilterYearToAdd(e.target.value); setSelectedStudentToAdd(''); }}>
                  <option value="1">الفرقة 1</option>
                  <option value="2">الفرقة 2</option>
                  <option value="3">الفرقة 3</option>
                  <option value="4">الفرقة 4</option>
                </select>
              </div>
              <div style={{flex:1,minWidth:'250px'}}>
                <label style={{display:'block',marginBottom:'8px',fontSize:'0.9rem'}}>2. اسم أو رقم الطالب:</label>
                <select className="input-field" value={selectedStudentToAdd} onChange={e => setSelectedStudentToAdd(e.target.value)}>
                  <option value="">-- اختر طالباً من الفرقة {filterYearToAdd} ({candidateStudents.length} متاح) --</option>
                  {candidateStudents.map(s => <option key={s.id} value={s.user_id}>{s.name} ({s.user_id}) - {normalizeSection(s.section || 'S1')}</option>)}
                </select>
              </div>
              <button className="btn-primary" onClick={handleAddCustomStudent} disabled={!selectedStudentToAdd}>
                <UserPlus size={18} /> إضافة للمادة
              </button>
            </div>
          )}
        </div>
      )}

      {/* 1. ERGONOMIC MODERN CARDS VIEW */}
      {selectedSubject && viewMode === 'cards' && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))',gap:'1.2rem'}}>
          {displayedEnrolledStudents.map((s, idx) => {
            const status = attendanceRecords[s.user_id] || null;
            const excuse = excuseReasons[s.user_id] || '';
            
            // Dynamic card border and ambient glow based on status
            let cardBorder = '1px solid var(--border)';
            let cardBg = 'var(--surface)';
            let statusIndicatorColor = 'transparent';

            if (status === 'present') {
              cardBorder = '1px solid rgba(16, 185, 129, 0.45)';
              cardBg = 'linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, var(--surface) 100%)';
              statusIndicatorColor = 'var(--success)';
            } else if (status === 'absent') {
              cardBorder = '1px solid rgba(239, 68, 68, 0.45)';
              cardBg = 'linear-gradient(180deg, rgba(239, 68, 68, 0.05) 0%, var(--surface) 100%)';
              statusIndicatorColor = 'var(--danger)';
            } else if (status === 'late') {
              cardBorder = '1px solid rgba(245, 158, 11, 0.45)';
              cardBg = 'linear-gradient(180deg, rgba(245, 158, 11, 0.05) 0%, var(--surface) 100%)';
              statusIndicatorColor = 'var(--warning)';
            } else if (status === 'excused') {
              cardBorder = '1px solid rgba(59, 130, 246, 0.45)';
              cardBg = 'linear-gradient(180deg, rgba(59, 130, 246, 0.05) 0%, var(--surface) 100%)';
              statusIndicatorColor = '#3b82f6';
            }

            return (
              <div 
                key={s.id} 
                className="panel" 
                style={{
                  padding:'1.2rem',
                  position:'relative',
                  border: cardBorder,
                  background: cardBg,
                  borderRadius:'12px',
                  boxShadow: status ? '0 4px 15px rgba(0,0,0,0.2)' : 'none',
                  transition:'all 0.2s ease',
                  display:'flex',
                  flexDirection:'column',
                  justifyContent:'space-between'
                }}
              >
                
                {/* Top Strip Status Indicator */}
                {status && (
                  <div style={{
                    position:'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height:'3px',
                    background: statusIndicatorColor,
                    borderTopLeftRadius:'12px',
                    borderTopRightRadius:'12px'
                  }} />
                )}

                {/* Card Header: Avatar Index + Name + Badges */}
                <div style={{marginBottom:'1rem',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div style={{display:'flex',gap:'10px',alignItems:'flex-start',flex:1}}>
                    
                    {/* Student Number Circle */}
                    <div style={{
                      width:'36px',
                      height:'36px',
                      borderRadius:'50%',
                      background:'rgba(79, 70, 229, 0.12)',
                      color:'var(--primary-hover)',
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'center',
                      fontWeight:800,
                      fontSize:'0.85rem',
                      flexShrink: 0
                    }}>
                      #{idx + 1}
                    </div>

                    <div>
                      <h4 style={{margin:'0 0 4px 0',fontSize:'1.15rem',fontWeight:800,color:'var(--text-main)',lineHeight:'1.35'}}>
                        {s.name}
                      </h4>
                      <div style={{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap',marginTop:'4px'}}>
                        <span className="badge" style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text-muted)',fontFamily:'monospace',fontSize:'0.8rem'}}>
                          {s.user_id}
                        </span>
                        <span className="badge" style={{background:'rgba(16, 185, 129, 0.12)',border:'1px solid rgba(16, 185, 129, 0.25)',color:'var(--success)',fontWeight:700,fontSize:'0.8rem'}}>
                          {normalizeSection(s.section || 'S1')}
                        </span>
                        <span className="badge" style={{background:'rgba(79, 70, 229, 0.08)',color:'var(--primary-hover)',border:'1px solid rgba(79, 70, 229, 0.2)',fontSize:'0.75rem'}}>
                          فرقة {normalizeYear(s.year_level)}
                        </span>
                      </div>
                      {status === 'excused' && excuse && (
                        <div style={{marginTop:'6px',fontSize:'0.8rem',color:'#3b82f6',display:'flex',alignItems:'center',gap:'4px'}}>
                          <MessageSquare size={13} /> <span>سبب العذر: {excuse}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {isSuper && (
                    <button 
                      onClick={() => handleExcludeStudent(s.user_id, s.name)} 
                      style={{background:'transparent',border:'none',color:'var(--text-muted)',cursor:'pointer',padding:'4px',borderRadius:'4px',transition:'all 0.2s',opacity:0.6}} 
                      title="حذف الطالب من هذه المادة فقط (صلاحية المدير)" 
                      onMouseOver={e=>{e.currentTarget.style.color='var(--danger)'; e.currentTarget.style.opacity='1';}} 
                      onMouseOut={e=>{e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.opacity='0.6';}}
                    >
                      <UserMinus size={16} />
                    </button>
                  )}
                </div>

                {/* Modern 4-Segment Action Bar */}
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'repeat(4, 1fr)',
                  gap:'6px',
                  background:'var(--bg)',
                  padding:'4px',
                  borderRadius:'8px',
                  border:'1px solid var(--border)'
                }}>
                  <button 
                    onClick={()=>toggleAttendance(s.user_id,'present')} 
                    style={{
                      border:'none',
                      borderRadius:'6px',
                      padding:'8px 0',
                      fontSize:'0.9rem',
                      fontWeight:800,
                      cursor:'pointer',
                      transition:'all 0.15s ease',
                      background: status === 'present' ? 'var(--success)' : 'transparent',
                      color: status === 'present' ? '#ffffff' : 'var(--text-muted)',
                      boxShadow: status === 'present' ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none'
                    }}
                  >
                    حاضر ✓
                  </button>

                  <button 
                    onClick={()=>toggleAttendance(s.user_id,'absent')} 
                    style={{
                      border:'none',
                      borderRadius:'6px',
                      padding:'8px 0',
                      fontSize:'0.9rem',
                      fontWeight:800,
                      cursor:'pointer',
                      transition:'all 0.15s ease',
                      background: status === 'absent' ? 'var(--danger)' : 'transparent',
                      color: status === 'absent' ? '#ffffff' : 'var(--text-muted)',
                      boxShadow: status === 'absent' ? '0 2px 8px rgba(239, 68, 68, 0.4)' : 'none'
                    }}
                  >
                    غائب ✗
                  </button>

                  <button 
                    onClick={()=>toggleAttendance(s.user_id,'late')} 
                    style={{
                      border:'none',
                      borderRadius:'6px',
                      padding:'8px 0',
                      fontSize:'0.85rem',
                      fontWeight:800,
                      cursor:'pointer',
                      transition:'all 0.15s ease',
                      background: status === 'late' ? 'var(--warning)' : 'transparent',
                      color: status === 'late' ? '#000000' : 'var(--text-muted)',
                      boxShadow: status === 'late' ? '0 2px 8px rgba(245, 158, 11, 0.4)' : 'none'
                    }}
                  >
                    تأخير
                  </button>

                  <button 
                    onClick={()=>toggleAttendance(s.user_id,'excused')} 
                    style={{
                      border:'none',
                      borderRadius:'6px',
                      padding:'8px 0',
                      fontSize:'0.85rem',
                      fontWeight:800,
                      cursor:'pointer',
                      transition:'all 0.15s ease',
                      background: status === 'excused' ? '#3b82f6' : 'transparent',
                      color: status === 'excused' ? '#ffffff' : 'var(--text-muted)',
                      boxShadow: status === 'excused' ? '0 2px 8px rgba(59, 130, 246, 0.4)' : 'none'
                    }}
                  >
                    عذر
                  </button>
                </div>

              </div>
            );
          })}
          {displayedEnrolledStudents.length === 0 && (
            <div className="panel" style={{gridColumn:'1 / -1',textAlign:'center',padding:'3rem',color:'var(--text-muted)'}}>
              <Users size={40} style={{marginBottom:'1rem',opacity:0.5}} />
              <h4 style={{margin:'0 0 8px 0',color:'var(--text-main)'}}>لا يوجد طلاب يطابقون التصفية في هذه المادة</h4>
              <p style={{margin:'0 0 1.5rem 0',fontSize:'0.9rem'}}>يمكنك إضافة الطلاب للمادة أو تغيير تصفية السكشن أو البحث.</p>
              {isSuper && (
                <button className="btn-primary" onClick={() => setShowManageStudents(true)}>
                  <UserPlus size={16} /> إضافة طلاب لهذه المادة
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. COMPACT TABLE / LIST VIEW */}
      {selectedSubject && viewMode === 'table' && (
        <div className="panel" style={{padding:0,overflowX:'auto'}}>
          <table className="table" style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'rgba(255,255,255,0.02)',borderBottom:'1px solid var(--border)',textAlign:'right'}}>
                <th style={{padding:'12px 16px',width:'40px',textAlign:'center'}}>#</th>
                <th style={{padding:'12px 16px'}}>الرقم الأكاديمي</th>
                <th style={{padding:'12px 16px'}}>اسم الطالب</th>
                <th style={{padding:'12px 16px'}}>السكشن</th>
                <th style={{padding:'12px 16px',textAlign:'center',minWidth:'320px'}}>حالة الحضور (أسبوع {week})</th>
                {isSuper && <th style={{padding:'12px 16px',width:'40px',textAlign:'center'}}></th>}
              </tr>
            </thead>
            <tbody>
              {displayedEnrolledStudents.map((s, idx) => {
                const status = attendanceRecords[s.user_id] || null;
                const excuse = excuseReasons[s.user_id] || '';
                return (
                  <tr key={s.id} style={{borderBottom:'1px solid var(--border)',background: status ? 'rgba(255,255,255,0.01)' : 'transparent'}}>
                    <td style={{padding:'12px 16px',textAlign:'center',color:'var(--text-muted)',fontWeight:700}}>{idx + 1}</td>
                    <td style={{padding:'12px 16px',fontWeight:'bold',fontFamily:'monospace'}}>{s.user_id}</td>
                    <td style={{padding:'12px 16px',fontWeight:700,fontSize:'1rem'}}>
                      {s.name}
                      {status === 'excused' && excuse && <span style={{fontSize:'0.75rem',color:'#3b82f6',display:'block'}}>عذر: {excuse}</span>}
                    </td>
                    <td style={{padding:'12px 16px'}}>
                      <span className="badge" style={{background:'rgba(16, 185, 129, 0.1)',color:'var(--success)',border:'1px solid rgba(16, 185, 129, 0.2)'}}>
                        {normalizeSection(s.section || 'S1')}
                      </span>
                    </td>
                    <td style={{padding:'8px 16px',textAlign:'center'}}>
                      <div style={{display:'inline-flex',gap:'6px',background:'var(--bg)',padding:'3px',borderRadius:'6px',border:'1px solid var(--border)'}}>
                        <button onClick={()=>toggleAttendance(s.user_id,'present')} style={{border:'none',borderRadius:'4px',padding:'6px 14px',fontSize:'0.85rem',fontWeight:800,cursor:'pointer',background: status === 'present' ? 'var(--success)' : 'transparent',color: status === 'present' ? '#fff' : 'var(--text-muted)'}}>حاضر ✓</button>
                        <button onClick={()=>toggleAttendance(s.user_id,'absent')} style={{border:'none',borderRadius:'4px',padding:'6px 14px',fontSize:'0.85rem',fontWeight:800,cursor:'pointer',background: status === 'absent' ? 'var(--danger)' : 'transparent',color: status === 'absent' ? '#fff' : 'var(--text-muted)'}}>غائب ✗</button>
                        <button onClick={()=>toggleAttendance(s.user_id,'late')} style={{border:'none',borderRadius:'4px',padding:'6px 12px',fontSize:'0.85rem',fontWeight:800,cursor:'pointer',background: status === 'late' ? 'var(--warning)' : 'transparent',color: status === 'late' ? '#000' : 'var(--text-muted)'}}>تأخير</button>
                        <button onClick={()=>toggleAttendance(s.user_id,'excused')} style={{border:'none',borderRadius:'4px',padding:'6px 12px',fontSize:'0.85rem',fontWeight:800,cursor:'pointer',background: status === 'excused' ? '#3b82f6' : 'transparent',color: status === 'excused' ? '#fff' : 'var(--text-muted)'}}>عذر</button>
                      </div>
                    </td>
                    {isSuper && (
                      <td style={{padding:'8px 16px',textAlign:'center'}}>
                        <button onClick={()=>handleExcludeStudent(s.user_id, s.name)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}} title="حذف الطالب من المادة">
                          <UserMinus size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* EXCUSE REASON MODAL */}
      {excuseModalStudent && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem'
        }}>
          <div className="panel fade-in" style={{maxWidth: '420px', width: '100%'}}>
            <h3 style={{marginTop:0,fontSize:'1.2rem',display:'flex',alignItems:'center',gap:'8px',color:'#3b82f6'}}>
              <MessageSquare size={18} /> تسجيل سبب العذر
            </h3>
            <p style={{fontSize:'0.9rem',color:'var(--text-muted)',marginBottom:'12px'}}>
              الطالب: <strong style={{color:'var(--text-main)'}}>{excuseModalStudent.name}</strong> ({excuseModalStudent.user_id})
            </p>
            <textarea
              className="input-field"
              rows="3"
              placeholder="اكتب سبب العذر هنا (مثال: عذر مرضي، إذن رعاية شباب، ظروف عائلية...)"
              value={excuseInputText}
              onChange={e => setExcuseInputText(e.target.value)}
              style={{width:'100%',padding:'10px',fontSize:'0.9rem',marginBottom:'1rem'}}
              autoFocus
            />
            <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={() => setExcuseModalStudent(null)}>
                إلغاء
              </button>
              <button className="btn-primary" onClick={handleSaveExcuseReason} style={{background:'#3b82f6'}}>
                حفظ العذر
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
