import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { exportExcelFile, parseExcelFile } from '../../utils/excelHelper';
import { cacheManager, isSuperUser } from '../../utils/dataCache';
import { Download, Upload, Save, Users, Filter, BookOpen, AlertCircle, Plus, X, Check, Eye, EyeOff, Bell, Send } from 'lucide-react';
import { getSectionInstructorName as resolveSectionTA } from '../../utils/sectionHelper';
import { getAdminBaseData } from '../../utils/adminDataHelper';
import { 
  parseGradeConfigs, 
  getSubjectVisibility, 
  getSubjectMaxScores, 
  saveSubjectGradeConfig, 
  DEFAULT_VISIBILITY, 
  DEFAULT_MAX_SCORES 
} from '../../utils/gradeConfigHelper';

export default function GradesTab({ user }) {
  const isSuper = isSuperUser(user);
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

  // Grade visibility and max scores configuration state
  const [gradeConfigs, setGradeConfigs] = useState({
    visibility: {},
    maxScores: {},
    colLabels: {},
    customColumns: []
  });

  // Custom grade columns state & modal
  const [showAddColModal, setShowAddColModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [addingCol, setAddingCol] = useState(false);

  // Notify Students Announcement Modal State
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyMsg, setNotifyMsg] = useState('');
  const [notifyAutoMakeVisible, setNotifyAutoMakeVisible] = useState(true);
  const [sendingNotification, setSendingNotification] = useState(false);

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
      const isSuper = isSuperUser(user);

      const { allUsersList, allSubList } = await getAdminBaseData(user);

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

      setAllAdmins(allUsersList.filter(u => u.role === 'admin' || u.role === 'super_admin' || isSuperUser(u)));
      setAllStudents(allUsersList.filter(u => u.role === 'student'));
      setSubjects(accessibleSubjects);

      const parsedConfigs = parseGradeConfigs(accessibleSubjects);
      setGradeConfigs(parsedConfigs);

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

  // Extract active custom columns for current subject
  const getActiveCustomColumns = () => {
    if (!selectedSubject) return [];
    const colsMap = new Map();
    subjects.forEach(sub => {
      if (Array.isArray(sub.excluded_students)) {
        sub.excluded_students.forEach(item => {
          if (typeof item === 'string' && item.startsWith('CONFIG_CUSTOM_COLS:')) {
            try {
              const parsed = JSON.parse(item.replace('CONFIG_CUSTOM_COLS:', ''));
              if (Array.isArray(parsed)) {
                parsed.forEach(c => {
                  if (c && c.id && (c.scope === 'global' || c.scope === selectedSubject)) {
                    colsMap.set(c.id, c);
                  }
                });
              }
            } catch (e) {}
          }
        });
      }
    });
    return Array.from(colsMap.values());
  };

  // Extract friendly label for standard and custom columns
  const getColumnLabel = (key, fallback) => {
    let label = fallback;
    subjects.forEach(sub => {
      if (Array.isArray(sub.excluded_students)) {
        sub.excluded_students.forEach(item => {
          if (typeof item === 'string' && item.startsWith('CONFIG_COL_LABELS:')) {
            try {
              const parsed = JSON.parse(item.replace('CONFIG_COL_LABELS:', ''));
              if (parsed[selectedSubject] && parsed[selectedSubject][key]) {
                label = parsed[selectedSubject][key];
              } else if (parsed.global && parsed.global[key]) {
                label = parsed.global[key];
              } else if (parsed[key] && typeof parsed[key] === 'string') {
                label = parsed[key];
              }
            } catch (e) {}
          }
        });
      }
    });
    return label;
  };

  const activeCustomCols = getActiveCustomColumns();
  const currentSubVis = getSubjectVisibility(gradeConfigs.visibility, selectedSubject);
  const currentSubMaxScores = getSubjectMaxScores(gradeConfigs.maxScores, selectedSubject);

  const handleToggleColumnVisibility = async (colKey) => {
    if (!selectedSubject) return;
    const updatedVis = {
      ...currentSubVis,
      [colKey]: !currentSubVis[colKey]
    };
    const newVisibility = {
      ...gradeConfigs.visibility,
      [selectedSubject]: updatedVis
    };
    setGradeConfigs(prev => ({ ...prev, visibility: newVisibility }));

    try {
      const cleanExcluded = await saveSubjectGradeConfig(supabase, selectedSubject, {
        visibility: updatedVis
      });
      const updatedSubs = subjects.map(s => s.id === selectedSubject ? { ...s, excluded_students: cleanExcluded } : s);
      setSubjects(updatedSubs);
      cacheManager.set('admin_subjects_base', updatedSubs);
      setMessage(`✅ تم تحديث ظهور الخانة (${updatedVis[colKey] ? 'ظاهرة للطالب' : 'مخفية عن الطالب'})`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Save visibility error:', err);
      setMessage('❌ فشل حفظ إعدادات الظهور');
    }
  };

  const handleMaxScoreChange = async (scoreKey, newVal) => {
    if (!selectedSubject) return;
    const num = Math.max(1, parseFloat(newVal) || 1);
    const updatedMax = {
      ...currentSubMaxScores,
      [scoreKey]: num
    };
    const newMaxScores = {
      ...gradeConfigs.maxScores,
      [selectedSubject]: updatedMax
    };
    setGradeConfigs(prev => ({ ...prev, maxScores: newMaxScores }));

    try {
      const cleanExcluded = await saveSubjectGradeConfig(supabase, selectedSubject, {
        maxScores: updatedMax
      });
      const updatedSubs = subjects.map(s => s.id === selectedSubject ? { ...s, excluded_students: cleanExcluded } : s);
      setSubjects(updatedSubs);
      cacheManager.set('admin_subjects_base', updatedSubs);
      setAutoSaveStatus('✅ تم حفظ الدرجة العظمى');
      setTimeout(() => setAutoSaveStatus(''), 2500);
    } catch (err) {
      console.error('Save max score error:', err);
    }
  };

  const handleAddCustomColumn = async (e) => {
    if (e) e.preventDefault();
    const trimName = newColName.trim();
    if (!trimName || !selectedSubject) return;

    setAddingCol(true);
    try {
      const colKey = 'custom_' + Date.now();
      const newColObj = {
        id: colKey,
        label: trimName,
        scope: selectedSubject
      };

      const existingCols = getActiveCustomColumns();
      const updatedCols = [...existingCols, newColObj];
      const updatedVis = {
        ...currentSubVis,
        [colKey]: true
      };

      const cleanExcluded = await saveSubjectGradeConfig(supabase, selectedSubject, {
        customColumns: updatedCols,
        visibility: updatedVis
      });

      const updatedSubs = subjects.map(s => s.id === selectedSubject ? { ...s, excluded_students: cleanExcluded } : s);
      setSubjects(updatedSubs);
      cacheManager.set('admin_subjects_base', updatedSubs);

      setNewColName('');
      setShowAddColModal(false);
      setMessage('✅ تمت إضافة خانة "' + trimName + '" للمادة بنجاح!');
      setTimeout(() => setMessage(''), 3500);
    } catch (err) {
      console.error('Add custom column error:', err);
      setMessage('❌ حدث خطأ أثناء إضافة الخانة');
    } finally {
      setAddingCol(false);
    }
  };

  const fetchGrades = async () => {
    const cacheKey = 'grades_' + selectedSubject;
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      setGrades(cached);
      return;
    }

    const { data } = await supabase
      .from('grades')
      .select('student_id, quiz_1, quiz_2, project, attendance_score, final_grade, custom_grades')
      .eq('subject_id', selectedSubject);

    const grds = {};
    if (data) {
      data.forEach(g => {
        grds[g.student_id] = {
          quiz_1: g.quiz_1 || 0,
          quiz_2: g.quiz_2 || 0,
          project: g.project || 0,
          attendance_score: g.attendance_score || 0,
          ...(g.custom_grades || {})
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
    return resolveSectionTA(subId, sec, allAdmins, subjects);
  };

  // Dynamically calculate actual existing sections for the selected subject
  const getSubjectAvailableSections = () => {
    if (!selectedSubject) return ['S1'];
    const secSet = new Set();
    
    // 1. From enrolled students of this subject
    enrolledStudents.forEach(stu => {
      const s = getStudentSubSection(stu, selectedSubject);
      if (s) secSet.add(s);
    });

    // 2. From TA assignments for this subject
    allAdmins.forEach(adm => {
      if (Array.isArray(adm.assigned_subjects)) {
        adm.assigned_subjects.forEach(entry => {
          if (typeof entry === 'string' && entry.startsWith(selectedSubject + ':')) {
            const sec = normalizeSection(entry.split(':')[1]);
            if (sec) secSet.add(sec);
          }
        });
      }
    });

    let list = Array.from(secSet);
    if (list.length === 0) list = ['S1'];
    
    list.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    return list;
  };

  const availableSections = getSubjectAvailableSections();

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

    // Dynamic total & custom grades extraction
    const currentActiveCols = getActiveCustomColumns();
    let totalScore = (updatedStudentGrades.quiz_1 || 0) + (updatedStudentGrades.quiz_2 || 0) + (updatedStudentGrades.project || 0) + (updatedStudentGrades.attendance_score || 0);
    const customObj = {};
    currentActiveCols.forEach(col => {
      const v = updatedStudentGrades[col.id] || 0;
      customObj[col.id] = v;
      totalScore += v;
    });

    // Debounced Auto-Save
    if (saveTimeout) clearTimeout(saveTimeout);
    setAutoSaveStatus('جاري الحفظ...');
    const t = setTimeout(async () => {
      const { error } = await supabase.from('grades').upsert({
        student_id: studentId,
        subject_id: selectedSubject,
        quiz_1: updatedStudentGrades.quiz_1 || 0,
        quiz_2: updatedStudentGrades.quiz_2 || 0,
        project: updatedStudentGrades.project || 0,
        attendance_score: updatedStudentGrades.attendance_score || 0,
        custom_grades: customObj,
        final_grade: totalScore
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
      const currentActiveCols = getActiveCustomColumns();
      const rowsToUpsert = Object.keys(grades).map(studentId => {
        const g = grades[studentId] || {};
        let totalScore = (g.quiz_1 || 0) + (g.quiz_2 || 0) + (g.project || 0) + (g.attendance_score || 0);
        const customObj = {};
        currentActiveCols.forEach(col => {
          const v = g[col.id] || 0;
          customObj[col.id] = v;
          totalScore += v;
        });

        return {
          student_id: studentId,
          subject_id: selectedSubject,
          quiz_1: g.quiz_1 || 0,
          quiz_2: g.quiz_2 || 0,
          project: g.project || 0,
          attendance_score: g.attendance_score || 0,
          custom_grades: customObj,
          final_grade: totalScore
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
      setMessage('✅ تم حفظ وتأكيد كافة الدرجات بنجاح!');
      setTimeout(() => setMessage(''), 3500);
    } catch (err) {
      console.error('Save grades error:', err);
      setMessage('❌ حدث خطأ أثناء حفظ الدرجات');
    } finally {
      setSaving(false);
    }
  };

  // Download pre-filled grades template for the current subject and section (including custom columns)
  const handleDownloadGradesTemplate = () => {
    if (!currentSub) return;
    const currentActiveCols = getActiveCustomColumns();

    const templateData = displayedEnrolledStudents.map(stu => {
      const g = grades[stu.user_id] || { quiz_1: 0, quiz_2: 0, project: 0, attendance_score: 0 };
      let total = (g.quiz_1 || 0) + (g.quiz_2 || 0) + (g.project || 0) + (g.attendance_score || 0);

      const row = {
        'ID': stu.user_id,
        'Name': stu.name,
        'Section': getStudentSubSection(stu, selectedSubject),
        [getColumnLabel('showQuiz1', 'كويز 1')]: g.quiz_1 || 0,
        [getColumnLabel('showQuiz2', 'كويز 2')]: g.quiz_2 || 0,
        [getColumnLabel('showProject', 'المشروع')]: g.project || 0,
        [getColumnLabel('showAttendanceScore', 'درجة الحضور')]: g.attendance_score || 0
      };

      currentActiveCols.forEach(col => {
        const val = g[col.id] || 0;
        total += val;
        row[col.label] = val;
      });

      row['المجموع الكلي'] = total;
      return row;
    });

    if (templateData.length === 0) {
      const sampleRow = {
        'ID': '2200101',
        'Name': 'اسم الطالب التجريبي',
        'Section': 'S1',
        [getColumnLabel('showQuiz1', 'كويز 1')]: 10,
        [getColumnLabel('showQuiz2', 'كويز 2')]: 10,
        [getColumnLabel('showProject', 'المشروع')]: 20,
        [getColumnLabel('showAttendanceScore', 'درجة الحضور')]: 10
      };
      let sampleTotal = 50;
      currentActiveCols.forEach(col => {
        sampleRow[col.label] = 10;
        sampleTotal += 10;
      });
      sampleRow['المجموع الكلي'] = sampleTotal;
      templateData.push(sampleRow);
    }

    const secLabel = selectedSection !== 'all' ? ('_' + selectedSection) : '_All';
    exportExcelFile(templateData, 'نموذج_رصد_درجات_' + currentSub.name.replace(/[^a-zA-Z0-9؀-ۿ]/g, '_') + secLabel + '.xlsx');
  };

  const handleExport = async () => {
    if (!currentSub) return;
    const currentActiveCols = getActiveCustomColumns();

    const exportData = displayedEnrolledStudents.map(stu => {
      const g = grades[stu.user_id] || { quiz_1: 0, quiz_2: 0, project: 0, attendance_score: 0 };
      let total = (g.quiz_1 || 0) + (g.quiz_2 || 0) + (g.project || 0) + (g.attendance_score || 0);

      const row = {
        'ID': stu.user_id,
        'Name': stu.name,
        'Section': getStudentSubSection(stu, selectedSubject),
        [getColumnLabel('showQuiz1', 'كويز 1')]: g.quiz_1 || 0,
        [getColumnLabel('showQuiz2', 'كويز 2')]: g.quiz_2 || 0,
        [getColumnLabel('showProject', 'المشروع')]: g.project || 0,
        [getColumnLabel('showAttendanceScore', 'درجة الحضور')]: g.attendance_score || 0
      };

      currentActiveCols.forEach(col => {
        const val = g[col.id] || 0;
        total += val;
        row[col.label] = val;
      });

      row['المجموع الكلي'] = total;
      return row;
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
      const currentActiveCols = getActiveCustomColumns();

      rows.forEach(r => {
        const id = (r['ID'] || r['الرقم الأكاديمي'] || r['الكود'])?.toString().trim();
        if (id) {
          const currentStudent = newGrades[id] || {};
          const q1 = r['كويز 1'] ?? r['Quiz 1'] ?? r[getColumnLabel('showQuiz1', 'كويز 1')];
          const q2 = r['كويز 2'] ?? r['Quiz 2'] ?? r[getColumnLabel('showQuiz2', 'كويز 2')];
          const prj = r['المشروع'] ?? r['Project'] ?? r[getColumnLabel('showProject', 'المشروع')];
          const att = r['درجة الحضور'] ?? r['الحضور'] ?? r['Attendance'] ?? r[getColumnLabel('showAttendanceScore', 'درجة الحضور')];

          const updatedStudent = {
            ...currentStudent,
            quiz_1: q1 !== undefined ? (parseFloat(q1) || 0) : (currentStudent.quiz_1 || 0),
            quiz_2: q2 !== undefined ? (parseFloat(q2) || 0) : (currentStudent.quiz_2 || 0),
            project: prj !== undefined ? (parseFloat(prj) || 0) : (currentStudent.project || 0),
            attendance_score: att !== undefined ? (parseFloat(att) || 0) : (currentStudent.attendance_score || 0)
          };

          // Parse any custom column values from Excel
          currentActiveCols.forEach(col => {
            const cVal = r[col.label] ?? r[col.id];
            if (cVal !== undefined && cVal !== null && cVal !== '') {
              updatedStudent[col.id] = parseFloat(cVal) || 0;
            }
          });

          newGrades[id] = updatedStudent;
        }
      });

      setGrades(newGrades);
      cacheManager.set('grades_' + selectedSubject, newGrades);
      setMessage('✅ تم استيراد وتحديث الدرجات من الملف، اضغط "حفظ التعديلات" لتثبيتها');
    } catch (err) {
      console.error(err);
      setMessage('❌ فشل في قراءة ملف الدرجات');
    }
    setImporting(false);
    e.target.value = '';
    setTimeout(() => setMessage(''), 5000);
  };

  const handleOpenNotifyModal = () => {
    const sub = subjects.find(s => s.id === selectedSubject);
    const subName = sub ? sub.name : '';
    setNotifyTitle(`📢 إعلان ورصد درجات مادة ${subName}`);
    setNotifyMsg(`تم رصد وإعلان درجات مادة ${subName} الآن! يمكنك الدخول على حسابك والاطلاع على تفاصيل درجاتك.`);
    setShowNotifyModal(true);
  };

  const handleSendNotification = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const sub = subjects.find(s => s.id === selectedSubject);
    if (!sub) return;

    try {
      setSendingNotification(true);

      // 1. If instructor checked auto-make visible, ensure visibility is enabled
      if (notifyAutoMakeVisible) {
        const curVis = getSubjectVisibility(gradeConfigs.visibility, selectedSubject);
        const updatedVis = {
          ...gradeConfigs.visibility,
          [selectedSubject]: {
            ...curVis,
            showQuiz1: true,
            showQuiz2: true,
            showProject: true,
            showTotal: true
          }
        };
        setGradeConfigs(prev => ({ ...prev, visibility: updatedVis }));
        await saveSubjectGradeConfig(selectedSubject, {
          visibility: updatedVis,
          maxScores: gradeConfigs.maxScores
        });
      }

      // 2. Insert notification record
      const senderName = user?.name || 'أستاذ المادة';
      const finalTitle = notifyTitle.trim() || `📢 إعلان ورصد درجات مادة ${sub.name}`;
      const finalMsg = notifyMsg.trim() || `تم رصد وإعلان درجات مادة ${sub.name} الآن.`;

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('send_grade_notification', {
        p_subject_id: selectedSubject,
        p_subject_name: sub.name,
        p_year_level: normalizeYear(sub.year_level),
        p_sender_name: senderName,
        p_title: finalTitle,
        p_message: finalMsg
      });

      if (rpcErr) {
        console.warn('RPC notification notice, falling back to dual storage:', rpcErr);
        // Direct table insert fallback
        await supabase.from('notifications').insert({
          subject_id: selectedSubject,
          subject_name: sub.name,
          year_level: normalizeYear(sub.year_level),
          sender_name: senderName,
          title: finalTitle,
          message: finalMsg
        });

        // Dual-store tag in excluded_students
        const tag = 'CONFIG_NOTIF:' + JSON.stringify({
          id: Date.now().toString(),
          title: finalTitle,
          message: finalMsg,
          sender: senderName,
          createdAt: new Date().toISOString()
        });
        const currentEx = Array.isArray(sub.excluded_students) ? sub.excluded_students : [];
        const filtered = currentEx.filter(e => typeof e !== 'string' || !e.startsWith('CONFIG_NOTIF:'));
        filtered.push(tag);
        await supabase.from('subjects').update({ excluded_students: filtered }).eq('id', selectedSubject);
        sub.excluded_students = filtered;
      }

      setMessage(`✅ تم إرسال إشعار إعلان الدرجات بنجاح لجميع طلبة مادة (${sub.name})!`);
      setShowNotifyModal(false);
      setTimeout(() => setMessage(''), 6000);
    } catch (err) {
      console.error('Send notification error:', err);
      setMessage('❌ حدث خطأ أثناء إرسال الإشعار للطلبة.');
    } finally {
      setSendingNotification(false);
    }
  };

  if (loading) {
    return <div style={{padding:'3rem',textAlign:'center',color:'var(--text-muted)'}}>جاري تحميل الدرجات التفصيلية...</div>;
  }

  return (
    <div className="fade-in">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'1rem',borderBottom:'1px solid var(--border)',paddingBottom:'1.2rem'}}>
        <div>
          <h2 style={{margin:0,fontSize:'1.6rem',fontWeight:800}}>الدرجات التفصيلية</h2>
          <p className="text-muted" style={{margin:'5px 0 0 0',fontSize:'0.9rem'}}>
            الطلاب المعروضون: <strong style={{color:'var(--text-main)'}}>{displayedEnrolledStudents.length} طالب</strong> {selectedSection !== 'all' ? '(سكشن ' + selectedSection + ')' : '(جميع السكاشن)'}
          </p>
        </div>
        
        <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}}>
          <button 
            className="btn-secondary" 
            onClick={() => { setNewColName(''); setShowAddColModal(true); }}
            disabled={!selectedSubject}
            style={{color:'var(--primary-hover)',borderColor:'rgba(79, 70, 229, 0.4)',display:'inline-flex',alignItems:'center',gap:'8px',padding:'8px 14px',fontSize:'0.9rem',fontWeight:700}}
            title="إضافة خانة درجات مخصصة جديدة لهذه المادة (تظهر فوراً في الجدول ونموذج الإكسيل)"
          >
            <Plus size={17} /> إضافة خانة درجات جديدة
          </button>

          <button 
            className="btn-secondary" 
            onClick={handleDownloadGradesTemplate} 
            disabled={!selectedSubject || displayedEnrolledStudents.length === 0}
            style={{color:'var(--primary-hover)',borderColor:'rgba(79, 70, 229, 0.4)',display:'inline-flex',alignItems:'center',gap:'8px',padding:'8px 14px',fontSize:'0.9rem',fontWeight:700}}
            title="تحميل كشف رصد إكسيل جاهز يحتوي على أسماء وأكواد طلاب هذه المادة وكافة خاناتها لرصد درجاتهم وإعادة رفعه"
          >
            <Download size={17} /> 📥 تحميل نموذج رصد درجات المادة (.xlsx)
          </button>

          <label className="btn-secondary" style={{cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'8px',padding:'8px 14px',fontSize:'0.9rem',color:'#f59e0b',borderColor:'rgba(245, 158, 11, 0.4)'}}>
            <Upload size={17} /> {importing ? 'جاري الاستيراد...' : 'استيراد درجات من Excel'}
            <input type="file" accept=".xlsx, .xls" onChange={handleImport} style={{display:'none'}} disabled={importing || !selectedSubject} />
          </label>

          <button 
            className="btn-secondary" 
            onClick={handleExport} 
            disabled={!selectedSubject || displayedEnrolledStudents.length === 0} 
            style={{color:'var(--success)',borderColor:'rgba(16, 185, 129, 0.4)',display:'inline-flex',alignItems:'center',gap:'8px',padding:'8px 14px',fontSize:'0.9rem'}}
          >
            <Download size={17} /> تصدير إكسيل
          </button>

          <button 
            type="button"
            className="btn-secondary" 
            onClick={handleOpenNotifyModal}
            disabled={!selectedSubject}
            style={{
              background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(99, 102, 241, 0.25))',
              color: 'var(--primary-hover)',
              borderColor: 'var(--primary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              fontSize: '0.92rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
            title="إرسال إشعار فوري وتنبيه لجميع طلبة المادة بإعلان الدرجات"
          >
            <Bell size={17} /> 📢 إبلاغ الطلبة بالدرجات
          </button>

          <button 
            className="btn-primary" 
            onClick={saveGrades} 
            disabled={saving || !selectedSubject} 
            style={{padding:'9px 20px',fontSize:'0.95rem',fontWeight:800,display:'inline-flex',alignItems:'center',gap:'8px',background:'var(--primary)'}}
          >
            <Save size={18} /> {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
          </button>
        </div>
      </div>

      {autoSaveStatus && (
        <div style={{color:'var(--primary-hover)',fontSize:'0.85rem',fontWeight:700,marginBottom:'0.8rem',textAlign:'left'}}>
          {autoSaveStatus}
        </div>
      )}

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
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.8rem',marginBottom:'1rem',padding:'0.75rem 1.2rem',background:'rgba(79, 70, 229, 0.06)',border:'1px solid rgba(79, 70, 229, 0.2)',borderRadius:'10px',fontSize:'0.85rem'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'1.1rem'}}>💡</span>
              <span style={{color:'var(--text-muted)'}}>
                <strong style={{color:'var(--primary-hover)'}}>نظام درجات المادة:</strong> يمكنك ضبط الدرجة العظمى لكل كويز (مثلاً من 5 أو 10) والتحكم في إظهار أو إخفاء أي خانة للطلاب مباشرة عبر أيقونة العين 👁️ / 🙈.
              </span>
            </div>
            {autoSaveStatus && <span style={{color:'var(--success)',fontWeight:700}}>{autoSaveStatus}</span>}
          </div>

          <div className="panel" style={{padding:0,overflowX:'auto'}}>
            <table className="table" style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'rgba(255,255,255,0.02)',borderBottom:'1px solid var(--border)',textAlign:'right'}}>
                  <th style={{padding:'14px 16px'}}>الرقم الأكاديمي</th>
                  <th style={{padding:'14px 16px'}}>اسم الطالب</th>
                  <th style={{padding:'14px 16px'}}>السكشن</th>

                  {/* Quiz 1 */}
                  <th style={{padding:'12px 14px',textAlign:'center'}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        <span>{getColumnLabel('showQuiz1', 'كويز 1')}</span>
                        <button 
                          type="button" 
                          onClick={() => handleToggleColumnVisibility('showQuiz1')}
                          title={currentSubVis.showQuiz1 ? 'الدرجة ظاهرة للطلاب (اضغط للإخفاء)' : 'الدرجة مخفية عن الطلاب (اضغط للإظهار)'}
                          style={{
                            background: currentSubVis.showQuiz1 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid ' + (currentSubVis.showQuiz1 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
                            borderRadius: '4px', cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center',
                            color: currentSubVis.showQuiz1 ? 'var(--success)' : 'var(--danger)'
                          }}
                        >
                          {currentSubVis.showQuiz1 ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'0.75rem',color:'var(--text-muted)'}}>
                        <span>من:</span>
                        <input 
                          type="number" 
                          min="1"
                          max="100"
                          value={currentSubMaxScores.quiz_1 ?? 5} 
                          onChange={e => handleMaxScoreChange('quiz_1', e.target.value)}
                          style={{
                            width: '42px', padding: '2px 4px', textAlign: 'center', fontSize: '0.78rem',
                            borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 700
                          }}
                          title="تحديد الدرجة العظمى لكويز 1 في هذه المادة"
                        />
                      </div>
                    </div>
                  </th>

                  {/* Quiz 2 */}
                  <th style={{padding:'12px 14px',textAlign:'center'}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        <span>{getColumnLabel('showQuiz2', 'كويز 2')}</span>
                        <button 
                          type="button" 
                          onClick={() => handleToggleColumnVisibility('showQuiz2')}
                          title={currentSubVis.showQuiz2 ? 'الدرجة ظاهرة للطلاب (اضغط للإخفاء)' : 'الدرجة مخفية عن الطلاب (اضغط للإظهار)'}
                          style={{
                            background: currentSubVis.showQuiz2 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid ' + (currentSubVis.showQuiz2 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
                            borderRadius: '4px', cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center',
                            color: currentSubVis.showQuiz2 ? 'var(--success)' : 'var(--danger)'
                          }}
                        >
                          {currentSubVis.showQuiz2 ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'0.75rem',color:'var(--text-muted)'}}>
                        <span>من:</span>
                        <input 
                          type="number" 
                          min="1"
                          max="100"
                          value={currentSubMaxScores.quiz_2 ?? 5} 
                          onChange={e => handleMaxScoreChange('quiz_2', e.target.value)}
                          style={{
                            width: '42px', padding: '2px 4px', textAlign: 'center', fontSize: '0.78rem',
                            borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 700
                          }}
                          title="تحديد الدرجة العظمى لكويز 2 في هذه المادة"
                        />
                      </div>
                    </div>
                  </th>

                  {/* Project */}
                  <th style={{padding:'12px 14px',textAlign:'center'}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        <span>{getColumnLabel('showProject', 'المشروع')}</span>
                        <button 
                          type="button" 
                          onClick={() => handleToggleColumnVisibility('showProject')}
                          title={currentSubVis.showProject ? 'الدرجة ظاهرة للطلاب (اضغط للإخفاء)' : 'الدرجة مخفية عن الطلاب (اضغط للإظهار)'}
                          style={{
                            background: currentSubVis.showProject ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid ' + (currentSubVis.showProject ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
                            borderRadius: '4px', cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center',
                            color: currentSubVis.showProject ? 'var(--success)' : 'var(--danger)'
                          }}
                        >
                          {currentSubVis.showProject ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'0.75rem',color:'var(--text-muted)'}}>
                        <span>من:</span>
                        <input 
                          type="number" 
                          min="1"
                          max="100"
                          value={currentSubMaxScores.project ?? 10} 
                          onChange={e => handleMaxScoreChange('project', e.target.value)}
                          style={{
                            width: '42px', padding: '2px 4px', textAlign: 'center', fontSize: '0.78rem',
                            borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 700
                          }}
                          title="تحديد الدرجة العظمى للمشروع في هذه المادة"
                        />
                      </div>
                    </div>
                  </th>

                  {/* Attendance Score */}
                  <th style={{padding:'12px 14px',textAlign:'center'}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        <span>{getColumnLabel('showAttendanceScore', 'درجة الحضور')}</span>
                        <button 
                          type="button" 
                          onClick={() => handleToggleColumnVisibility('showAttendanceScore')}
                          title={currentSubVis.showAttendanceScore ? 'درجة الحضور ظاهرة للطلاب (اضغط للإخفاء)' : 'درجة الحضور مخفية عن الطلاب (اضغط للإظهار)'}
                          style={{
                            background: currentSubVis.showAttendanceScore ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid ' + (currentSubVis.showAttendanceScore ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
                            borderRadius: '4px', cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center',
                            color: currentSubVis.showAttendanceScore ? 'var(--success)' : 'var(--danger)'
                          }}
                        >
                          {currentSubVis.showAttendanceScore ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'0.75rem',color:'var(--text-muted)'}}>
                        <span>من:</span>
                        <input 
                          type="number" 
                          min="1"
                          max="100"
                          value={currentSubMaxScores.attendance_score ?? 5} 
                          onChange={e => handleMaxScoreChange('attendance_score', e.target.value)}
                          style={{
                            width: '42px', padding: '2px 4px', textAlign: 'center', fontSize: '0.78rem',
                            borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 700
                          }}
                          title="تحديد درجة الحضور في هذه المادة"
                        />
                      </div>
                    </div>
                  </th>

                  {/* Custom Columns */}
                  {activeCustomCols.map(col => {
                    const isColVisible = currentSubVis[col.id] !== false;
                    return (
                      <th key={col.id} style={{padding:'12px 14px',textAlign:'center',color:'var(--primary-hover)'}}>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                            <span>{col.label}</span>
                            <button 
                              type="button" 
                              onClick={() => handleToggleColumnVisibility(col.id)}
                              title={isColVisible ? 'الخانة ظاهرة للطلاب (اضغط للإخفاء)' : 'الخانة مخفية عن الطلاب (اضغط للإظهار)'}
                              style={{
                                background: isColVisible ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                border: '1px solid ' + (isColVisible ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
                                borderRadius: '4px', cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center',
                                color: isColVisible ? 'var(--success)' : 'var(--danger)'
                              }}
                            >
                              {isColVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'0.75rem',color:'var(--text-muted)'}}>
                            <span>من:</span>
                            <input 
                              type="number" 
                              min="1"
                              max="100"
                              value={currentSubMaxScores[col.id] ?? 5} 
                              onChange={e => handleMaxScoreChange(col.id, e.target.value)}
                              style={{
                                width: '42px', padding: '2px 4px', textAlign: 'center', fontSize: '0.78rem',
                                borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 700
                              }}
                              title={'تحديد الدرجة العظمى لـ ' + col.label}
                            />
                          </div>
                        </div>
                      </th>
                    );
                  })}

                  {/* Total */}
                  <th style={{padding:'12px 14px',textAlign:'center'}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        <span>المجموع</span>
                        <button 
                          type="button" 
                          onClick={() => handleToggleColumnVisibility('showTotal')}
                          title={currentSubVis.showTotal ? 'المجموع الكلي ظاهر للطلاب (اضغط للإخفاء)' : 'المجموع الكلي مخفي عن الطلاب (اضغط للإظهار)'}
                          style={{
                            background: currentSubVis.showTotal ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid ' + (currentSubVis.showTotal ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
                            borderRadius: '4px', cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center',
                            color: currentSubVis.showTotal ? 'var(--success)' : 'var(--danger)'
                          }}
                        >
                          {currentSubVis.showTotal ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                      </div>
                      <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                        {currentSubVis.showTotal ? 'ظاهر للطلاب' : 'مخفي للطلاب'}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
            <tbody>
              {displayedEnrolledStudents.map(stu => {
                const g = grades[stu.user_id] || { quiz_1: 0, quiz_2: 0, project: 0, attendance_score: 0 };
                let total = (g.quiz_1 || 0) + (g.quiz_2 || 0) + (g.project || 0) + (g.attendance_score || 0);
                activeCustomCols.forEach(col => { total += (g[col.id] || 0); });

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
                    {activeCustomCols.map(col => (
                      <td key={col.id} style={{padding:'10px 14px',textAlign:'center'}}>
                        <input 
                          type="number" 
                          className="input-field" 
                          style={{width:'80px',textAlign:'center',padding:'6px',borderColor:'rgba(79, 70, 229, 0.4)'}} 
                          value={g[col.id] || 0} 
                          onChange={e=>handleGradeChange(stu.user_id, col.id, e.target.value)} 
                        />
                      </td>
                    ))}
                    <td style={{padding:'14px 16px',textAlign:'center',fontWeight:'bold',color:'var(--primary-hover)',fontSize:'1.1rem'}}>
                      {total}
                    </td>
                  </tr>
                );
              })}
              {displayedEnrolledStudents.length === 0 && (
                <tr>
                  <td colSpan={8 + activeCustomCols.length} style={{textAlign:'center',padding:'3rem',color:'var(--text-muted)'}}>
                    لا يوجد طلاب يطابقون التصفية في هذه المادة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Modal: Add Custom Column */}
      {showAddColModal && (
        <div 
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem'
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddColModal(false); }}
        >
          <div className="panel fade-in" style={{maxWidth: '450px', width: '100%', border: '1px solid rgba(79, 70, 229, 0.4)', borderRadius: '16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.2rem',borderBottom:'1px solid var(--border)',paddingBottom:'0.8rem'}}>
              <h3 style={{margin:0,fontSize:'1.15rem',display:'flex',alignItems:'center',gap:'8px',color:'var(--primary-hover)'}}>
                <Plus size={19} /> إضافة خانة درجات جديدة للمادة
              </h3>
              <button onClick={() => setShowAddColModal(false)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddCustomColumn}>
              <div style={{marginBottom:'1.2rem'}}>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.88rem',fontWeight:700}}>
                  المادة المحددة:
                </label>
                <div style={{padding:'8px 12px',background:'var(--bg)',borderRadius:'8px',fontSize:'0.9rem',fontWeight:700,color:'var(--primary-hover)'}}>
                  {currentSub ? currentSub.name : 'يرجى اختيار مادة أولاً'}
                </div>
              </div>

              <div style={{marginBottom:'1.5rem'}}>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.88rem',fontWeight:700}}>
                  اسم الخانة الجديدة (مثال: ميدتيرم، تاسك 1، شيت عملي):
                </label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="مثال: ميدتيرم" 
                  value={newColName} 
                  onChange={e => setNewColName(e.target.value)} 
                  required 
                  autoFocus
                  style={{width:'100%',padding:'10px'}} 
                />
              </div>

              <div style={{display:'flex',justifyContent:'flex-end',gap:'10px'}}>
                <button type="button" className="btn-secondary" onClick={() => setShowAddColModal(false)} disabled={addingCol}>
                  إلغاء
                </button>
                <button type="submit" className="btn-primary" disabled={addingCol || !newColName.trim()} style={{background:'var(--primary)'}}>
                  {addingCol ? 'جاري الإضافة...' : 'إضافة وتثبيت الخانة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NOTIFY STUDENTS MODAL */}
      {showNotifyModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div className="panel fade-in" style={{
            maxWidth: '520px',
            width: '100%',
            background: 'var(--surface)',
            border: '2px solid var(--primary)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.2rem',borderBottom:'1px solid var(--border)',paddingBottom:'0.8rem'}}>
              <h3 style={{margin:0,fontSize:'1.15rem',fontWeight:800,color:'var(--primary-hover)',display:'flex',alignItems:'center',gap:'8px'}}>
                <Bell size={20} /> إرسال إشعار فوري للطلبة بإعلان الدرجات
              </h3>
              <button 
                type="button" 
                onClick={() => setShowNotifyModal(false)}
                style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSendNotification}>
              <div style={{marginBottom:'1rem'}}>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.85rem',fontWeight:700}}>
                  المادة المحددة:
                </label>
                <div style={{padding:'8px 12px',background:'var(--bg)',borderRadius:'8px',fontSize:'0.92rem',fontWeight:800,color:'var(--primary-hover)'}}>
                  {currentSub ? `${currentSub.name} (الفرقة ${normalizeYear(currentSub.year_level)})` : 'يرجى اختيار مادة'}
                </div>
              </div>

              <div style={{marginBottom:'1rem'}}>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.85rem',fontWeight:700}}>
                  عنوان الإشعار (يظهر في التنبيهات):
                </label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={notifyTitle} 
                  onChange={e => setNotifyTitle(e.target.value)} 
                  required 
                  style={{width:'100%',padding:'8px 10px'}} 
                />
              </div>

              <div style={{marginBottom:'1.2rem'}}>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.85rem',fontWeight:700}}>
                  نص وتفاصيل الإشعار للطلبة:
                </label>
                <textarea 
                  className="input-field" 
                  rows={3}
                  value={notifyMsg} 
                  onChange={e => setNotifyMsg(e.target.value)} 
                  required 
                  style={{width:'100%',padding:'10px',resize:'vertical'}} 
                />
              </div>

              <div style={{
                background: 'rgba(79, 70, 229, 0.08)',
                border: '1px solid rgba(79, 70, 229, 0.2)',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <input 
                  type="checkbox" 
                  id="chk-auto-vis" 
                  checked={notifyAutoMakeVisible} 
                  onChange={e => setNotifyAutoMakeVisible(e.target.checked)}
                  style={{cursor:'pointer',width:'16px',height:'16px'}}
                />
                <label htmlFor="chk-auto-vis" style={{fontSize:'0.85rem',fontWeight:700,cursor:'pointer',color:'var(--text-main)',margin:0}}>
                  تفعيل إظهار خانات الدرجات للطلبة تلقائياً (في حال كانت مخفية)
                </label>
              </div>

              <div style={{display:'flex',justifyContent:'flex-end',gap:'10px'}}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setShowNotifyModal(false)} 
                  disabled={sendingNotification}
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={sendingNotification || !notifyTitle.trim()} 
                  style={{
                    background:'var(--primary)',
                    display:'inline-flex',
                    alignItems:'center',
                    gap:'8px',
                    fontWeight:800,
                    padding:'8px 18px'
                  }}
                >
                  <Send size={16} /> {sendingNotification ? 'جاري الإرسال للطلبة...' : '📢 إرسال الإشعار لجميع الطلبة الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
