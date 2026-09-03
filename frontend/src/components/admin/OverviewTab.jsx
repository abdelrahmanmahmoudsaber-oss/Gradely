import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { cacheManager } from '../../utils/dataCache';
import { exportExcelFile, exportMultiSheetExcelFile, generateMultiSheetExcelBase64 } from '../../utils/excelHelper';
import { 
  Users, BookOpen, Clock, Shield, Sliders, Eye, EyeOff, 
  Download, Upload, Database, RefreshCw, CheckCircle2, AlertTriangle, FileSpreadsheet, Calendar,
  Edit, Trash2
} from 'lucide-react';

export default function OverviewTab({ user }) {
  const normalizeSection = (sec) => {
    if (!sec) return 'S1';
    const s = sec.toString().trim().toUpperCase().replace(/\s+/g, '');
    const match = s.match(/(\d+)/);
    if (match) return 'S' + parseInt(match[1], 10);
    return 'S1';
  };

  const getSectionInstructorName = (subId, sec) => {
    const secNorm = normalizeSection(sec || 'S1');
    for (const adm of allAdminsList) {
      if (Array.isArray(adm.assigned_subjects) && adm.assigned_subjects.includes(subId + ':' + secNorm)) {
        return adm.name;
      }
    }
    const subObj = allSubjectsList.find(s => s.id === subId);
    if (subObj?.instructor_name) return subObj.instructor_name;
    return 'المدير الرئيسي';
  };

  const [stats, setStats] = useState({
    totalStudents: 0,
    totalAdmins: 0,
    totalSubjects: 0,
    lowAttendanceCount: 0,
    lastUpdate: 'غير متوفر'
  });
  const [loading, setLoading] = useState(true);
  const [allSubjectsList, setAllSubjectsList] = useState([]);
  const [allStudentsList, setAllStudentsList] = useState([]);
  const [selectedSubjectForVisibility, setSelectedSubjectForVisibility] = useState('global');

  // Student Dashboard Visibility Configuration
  const [visibilitySettings, setVisibilitySettings] = useState({
    global: {
      showQuiz1: true,
      showQuiz2: true,
      showProject: true,
      showAttendanceScore: true,
      showTotal: true,
      showAttendanceTab: true
    }
  });

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [showCustomColumnModal, setShowCustomColumnModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnScope, setNewColumnScope] = useState('global');
  const [customColumnsList, setCustomColumnsList] = useState([]);
  const [columnLabels, setColumnLabels] = useState({}); // { [colKey]: 'Custom Label' }
  const [editingColumn, setEditingColumn] = useState(null); // { id, label, scope, isDefault }
  const [editLabelInput, setEditLabelInput] = useState('');

  // Backup & Restore State
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [backupSchedule, setBackupSchedule] = useState(() => localStorage.getItem('gradely_backup_schedule') || 'weekly');
  const [lastBackupDate, setLastBackupDate] = useState(() => localStorage.getItem('gradely_last_backup') || null);
  const [backupEmail, setBackupEmail] = useState(() => localStorage.getItem('gradely_backup_email') || 'admin@gradely.app');
  const [webhookScriptUrl, setWebhookScriptUrl] = useState(() => localStorage.getItem('gradely_webhook_url') || 'https://script.google.com/macros/s/AKfycbzBUNCHESyAtmUK_V8Wm7KV-8zdV3mmpoI8ACd6KHtLRBlhG7B28EiPKZVXf9SU7haiEQ/exec');
  const [sendingEmail, setSendingEmail] = useState(false);

  const isSuper = !user || user.user_id === 'admin';

  useEffect(() => {
    fetchOverviewData();
  }, []);

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
            } else if (item.startsWith('CONFIG_CUSTOM_COLS:')) {
              try {
                const cols = JSON.parse(item.replace('CONFIG_CUSTOM_COLS:', ''));
                setCustomColumnsList(cols);
              } catch (e) {}
            } else if (item.startsWith('CONFIG_COL_LABELS:')) {
              try {
                const lbls = JSON.parse(item.replace('CONFIG_COL_LABELS:', ''));
                setColumnLabels(lbls);
              } catch (e) {}
            }
          }
        });
      }
    }
    return settings;
  };

  const fetchOverviewData = async () => {
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

      setAllSubjectsList(allSubList);

      const parsedConfig = parseVisibilityFromSubjects(allSubList);
      if (parsedConfig) {
        setVisibilitySettings(parsedConfig);
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
        // Default TA to their first accessible subject if currently global
        if (accessibleSubjects.length > 0 && selectedSubjectForVisibility === 'global') {
          setSelectedSubjectForVisibility(accessibleSubjects[0].id);
        }
      }

      const allStudents = allUsersList.filter(u => u.role === 'student');
      const allAdmins = allUsersList.filter(u => u.role === 'admin');

      let visibleStudentsCount = allStudents.length;
      if (!isSuper) {
        const relevantStudentIds = new Set();
        accessibleSubjects.forEach(s => {
          if (Array.isArray(s.enrolled_students)) {
            s.enrolled_students.forEach(id => relevantStudentIds.add(id));
          }
        });
        visibleStudentsCount = relevantStudentIds.size;
      }

      setStats({
        totalStudents: visibleStudentsCount,
        totalAdmins: allAdmins.length,
        totalSubjects: accessibleSubjects.length,
        lowAttendanceCount: 0,
        lastUpdate: 'نشط الآن'
      });

    } catch (err) {
      console.error('Fetch overview error:', err);
    } finally {
      setLoading(false);
    }
  };

  const defaultVis = {
    showQuiz1: true,
    showQuiz2: true,
    showProject: true,
    showAttendanceScore: true,
    showTotal: true,
    showAttendanceTab: true
  };

  const currentActiveVisibility = {
    ...defaultVis,
    ...(visibilitySettings.global || {}),
    ...(visibilitySettings[selectedSubjectForVisibility] || {})
  };

  const handleToggleVisibility = async (key) => {
    const currentSubScope = selectedSubjectForVisibility;
    const updatedSubScope = {
      ...currentActiveVisibility,
      [key]: !currentActiveVisibility[key]
    };

    const updatedSettings = {
      ...visibilitySettings,
      [currentSubScope]: updatedSubScope
    };

    setVisibilitySettings(updatedSettings);
    setSavingSettings(true);
    setSettingsMessage('جاري الحفظ...');

    try {
      const globalConfigStr = 'CONFIG:' + JSON.stringify(updatedSettings.global || {});
      const subConfigStr = 'CONFIG_SUB:' + JSON.stringify(updatedSettings);

      const { data: subData } = await supabase.from('subjects').select('id, excluded_students');
      if (subData && subData.length > 0) {
        await Promise.all(subData.map(async sub => {
          const cleanExcluded = Array.isArray(sub.excluded_students) 
            ? sub.excluded_students.filter(x => typeof x === 'string' && !x.startsWith('CONFIG:') && !x.startsWith('CONFIG_SUB:')) 
            : [];
          cleanExcluded.push(globalConfigStr);
          cleanExcluded.push(subConfigStr);
          return supabase.from('subjects').update({ excluded_students: cleanExcluded }).eq('id', sub.id);
        }));
      }

      cacheManager.clear();
      setSettingsMessage('✅ تم حفظ وتطبيق التعديل فوراً!');
      setTimeout(() => setSettingsMessage(''), 3000);
    } catch (err) {
      console.error('Save visibility error:', err);
      setSettingsMessage('❌ فشل حفظ الإعدادات');
    } finally {
      setSavingSettings(false);
    }
  };

  // FULL COMPREHENSIVE BACKUP (ALL TABLES: USERS + SUBJECTS + ATTENDANCE + GRADES)
  // GENERATE ADVANCED ATTENDANCE MATRIX WORKBOOK (PER-WEEK SPREADSHEET FOR FACULTY/TAs)
  const handleAttendanceMatrixBackup = async () => {
    try {
      setBackingUp(true);
      setBackupMessage('جاري استخراج كشوف الغياب التفصيلية لكافة الأسابيع...');

      const [usersRes, subRes, attRes] = await Promise.all([
        supabase.from('users').select('id, user_id, name, role, year_level, section, assigned_subjects'),
        supabase.from('subjects').select('id, name, year_level, total_weeks, instructor_name, instructor_id, enrolled_students, excluded_students'),
        supabase.from('attendance').select('student_id, subject_id, week_number, status')
      ]);

      const allUsers = usersRes.data || [];
      const allSubs = subRes.data || [];
      const allAtt = attRes.data || [];

      // Filter subjects accessible to current user (all for super, assigned for TA)
      const freshCurrentUser = allUsers.find(u => u.user_id === user.user_id) || user;
      const rawAssigned = Array.isArray(freshCurrentUser?.assigned_subjects) ? freshCurrentUser.assigned_subjects : [];
      const assignedSubIds = rawAssigned.map(e => e.split(':')[0]);

      let mySubs = [];
      if (isSuper) {
        mySubs = allSubs;
      } else {
        mySubs = allSubs.filter(s => 
          s.instructor_id === user.user_id || 
          s.instructor_name === user.name || 
          assignedSubIds.includes(s.id)
        );
      }

      if (mySubs.length === 0) {
        setBackupMessage('❌ لا توجد مواد مسندة لتصدير كشوفها');
        setBackingUp(false);
        return;
      }

      // Group attendance records by: subId -> studentId -> weekNum -> status
      const attMatrix = {};
      allAtt.forEach(r => {
        if (!attMatrix[r.subject_id]) attMatrix[r.subject_id] = {};
        if (!attMatrix[r.subject_id][r.student_id]) attMatrix[r.subject_id][r.student_id] = {};
        attMatrix[r.subject_id][r.student_id][r.week_number] = r.status;
      });

      const sheets = [];

      mySubs.forEach(sub => {
        const totalWeeks = sub.total_weeks || 12;
        const subAtt = attMatrix[sub.id] || {};

        // Find enrolled students for this subject
        const enrolled = allUsers.filter(u => {
          if (u.role !== 'student') return false;
          const inSub = Array.isArray(sub.enrolled_students) && sub.enrolled_students.includes(u.user_id);
          const hasAssigned = Array.isArray(u.assigned_subjects) && u.assigned_subjects.some(e => typeof e === 'string' && e.startsWith(sub.id + ':'));
          return inSub || hasAssigned;
        });

        const rows = enrolled.map(stu => {
          const stuSubSec = (() => {
            if (Array.isArray(stu.assigned_subjects)) {
              const m = stu.assigned_subjects.find(e => typeof e === 'string' && e.startsWith(sub.id + ':'));
              if (m) return m.split(':')[1];
            }
            return stu.section || 'S1';
          })();

          const row = {
            'الرقم الأكاديمي': stu.user_id,
            'اسم الطالب': stu.name,
            'السكشن': stuSubSec,
            'الفرقة': stu.year_level || sub.year_level || '1'
          };

          let presentCount = 0;
          let absentCount = 0;
          let lateCount = 0;
          let excusedCount = 0;

          for (let w = 1; w <= totalWeeks; w++) {
            const st = subAtt[stu.user_id]?.[w];
            let label = 'لم يرصد';
            if (st === 'present') { label = 'حاضر'; presentCount++; }
            else if (st === 'absent') { label = 'غائب'; absentCount++; }
            else if (st === 'late') { label = 'تأخير'; lateCount++; presentCount += 0.5; }
            else if (st === 'excused') { label = 'عذر'; excusedCount++; }
            row['أسبوع ' + w] = label;
          }

          const totalRecorded = presentCount + absentCount + (lateCount * 0.5);
          const attRate = totalRecorded > 0 ? Math.round((presentCount / totalRecorded) * 100) + '%' : '0%';

          row['إجمالي الحضور'] = presentCount;
          row['إجمالي الغياب'] = absentCount;
          row['تأخير / عذر'] = lateCount + excusedCount;
          row['نسبة الالتزام'] = attRate;

          return row;
        });

        // Clean sheet name (max 31 chars for excel)
        let sheetName = sub.name.replace(/[:\/?*[\]]/g, '').slice(0, 28);
        if (!sheetName) sheetName = 'مادة ' + sub.id.slice(0, 6);
        sheets.push({ name: sheetName, data: rows });
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 10);
      const filename = isSuper ? `كشوف_الغياب_الشاملة_لكافة_المواد_${timestamp}.xlsx` : `كشوف_الغياب_لمواد_المعيد_${timestamp}.xlsx`;

      await exportMultiSheetExcelFile(sheets, filename);

      const nowIso = new Date().toLocaleString('ar-EG');
      setLastBackupDate(nowIso);
      localStorage.setItem('gradely_last_backup', nowIso);

      setBackupMessage('✅ تم استخراج وتصدير شيت كشوف الغياب المنظمة بنجاح!');
      setTimeout(() => setBackupMessage(''), 5000);
    } catch (err) {
      console.error('Matrix backup error:', err);
      setBackupMessage('❌ حدث خطأ أثناء إنشاء كشوف الغياب: ' + err.message);
    } finally {
      setBackingUp(false);
    }
  };

  const handleFullBackup = async (format = 'json') => {
    if (!isSuper) return;
    setBackingUp(true);
    setBackupMessage('');

    try {
      const [usersRes, subRes, attRes, grdRes] = await Promise.all([
        supabase.from('users').select('id, user_id, name, role, year_level, section, assigned_subjects, auth_id, created_at'),
        supabase.from('subjects').select('*'),
        supabase.from('attendance').select('*'),
        supabase.from('grades').select('*')
      ]);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupData = {
        version: 'Gradely-v2-FullBackup',
        exportedAt: new Date().toISOString(),
        users: usersRes.data || [],
        subjects: subRes.data || [],
        attendance: attRes.data || [],
        grades: grdRes.data || []
      };

      if (format === 'json') {
        const jsonStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Gradely_Full_System_Backup_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Multi-Sheet Comprehensive Excel Workbook
        const subMap = {};
        (subRes.data || []).forEach(s => { subMap[s.id] = s.name; });

        const usersSheet = (usersRes.data || []).map(u => ({
          'الرقم الأكاديمي / كود المستخدم': u.user_id,
          'الاسم': u.name,
          'الدور': u.role === 'admin' ? 'معيد/مشرف' : 'طالب',
          'الفرقة': u.year_level || '1',
          'السكشن': u.section || 'S1',
          'المواد والسكاشن المسندة': Array.isArray(u.assigned_subjects) ? u.assigned_subjects.join(', ') : '',
          'تاريخ التسجيل': u.created_at || ''
        }));

        const subjectsSheet = (subRes.data || []).map(s => ({
          'كود المادة': s.id,
          'اسم المادة': s.name,
          'الفرقة': s.year_level,
          'عدد الأسابيع': s.total_weeks,
          'المشرف/المعيد الرئيسي': s.instructor_name || '',
          'عدد الطلاب المسجلين': Array.isArray(s.enrolled_students) ? s.enrolled_students.length : 0
        }));

        const attendanceSheet = (attRes.data || []).map(a => ({
          'رقم الطالب': a.student_id,
          'المادة': subMap[a.subject_id] || a.subject_id,
          'رقم الأسبوع': `الأسبوع ${a.week_number}`,
          'تاريخ المحاضرة': a.session_date || '',
          'الحالة': a.status === 'present' ? 'حاضر' : a.status === 'absent' ? 'غائب' : a.status === 'late' ? 'تأخير' : a.status === 'excused' ? 'عذر' : a.status,
          'سبب العذر': a.excuse_reason || ''
        }));

        const gradesSheet = (grdRes.data || []).map(g => ({
          'رقم الطالب': g.student_id,
          'المادة': subMap[g.subject_id] || g.subject_id,
          'كويز 1': g.quiz_1 || 0,
          'كويز 2': g.quiz_2 || 0,
          'المشروع/العملي': g.project || 0,
          'درجة الحضور': g.attendance_score || 0,
          'المجموع النهائي': g.final_grade || 0
        }));

        await exportMultiSheetExcelFile([
          { name: 'المستخدمين والطلاب', data: usersSheet },
          { name: 'المواد الدراسية', data: subjectsSheet },
          { name: 'كشف الغياب لكافة الأسابيع', data: attendanceSheet },
          { name: 'كشف الدرجات الشامل', data: gradesSheet }
        ], `Gradely_Comprehensive_Backup_${timestamp}.xlsx`);
      }

      const nowIso = new Date().toLocaleString('ar-EG');
      setLastBackupDate(nowIso);
      localStorage.setItem('gradely_last_backup', nowIso);

      setBackupMessage('✅ تم إنشاء وتحميل النسخة الاحتياطية الشاملة بنجاح!');
      setTimeout(() => setBackupMessage(''), 5000);
    } catch (err) {
      console.error('Backup error:', err);
      setBackupMessage('❌ فشل إنشاء النسخة الاحتياطية: ' + err.message);
    } finally {
      setBackingUp(false);
    }
  };

  // ROBUST SYSTEM RESTORE (INSERTS/UPSERTS ALL 4 TABLES)
  const handleRestoreFromFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setRestoring(true);
        setBackupMessage('جاري فحص واستعادة كافة جداول النظام...');
        const parsed = JSON.parse(event.target.result);

        if (!parsed.users || !parsed.subjects) {
          throw new Error('الملف المختار لا يحتوي على بنية النسخة الاحتياطية الصحيحة للنظام.');
        }

        if (!window.confirm(`تحذير هام: سيتم استعادة كافة الطلاب (${parsed.users?.length || 0} مستخدم)، والمواد (${parsed.subjects?.length || 0} مادة)، والغياب (${parsed.attendance?.length || 0} سجل)، والدرجات (${parsed.grades?.length || 0} درجة). هل أنت متأكد من المتابعة؟`)) {
          setRestoring(false);
          setBackupMessage('');
          return;
        }

        // 1. Restore Users (including all deleted students/TAs)
        if (Array.isArray(parsed.users) && parsed.users.length > 0) {
          const cleanUsers = parsed.users.map(u => ({
            user_id: u.user_id,
            name: u.name,
            role: u.role,
            year_level: u.year_level || '1',
            section: u.section || 'S1',
            assigned_subjects: u.assigned_subjects || [],
            auth_id: u.auth_id || null
          }));
          await supabase.from('users').upsert(cleanUsers, { onConflict: 'user_id' });
        }

        // 2. Restore Subjects
        if (Array.isArray(parsed.subjects) && parsed.subjects.length > 0) {
          await supabase.from('subjects').upsert(parsed.subjects, { onConflict: 'id' });
        }

        // 3. Restore Grades
        if (Array.isArray(parsed.grades) && parsed.grades.length > 0) {
          await supabase.from('grades').upsert(parsed.grades, { onConflict: 'student_id,subject_id' });
        }

        // 4. Restore Attendance
        if (Array.isArray(parsed.attendance) && parsed.attendance.length > 0) {
          await supabase.from('attendance').upsert(parsed.attendance, { onConflict: 'student_id,subject_id,week_number' });
        }

        cacheManager.clear();
        setBackupMessage('🎉 تم استعادة قاعدة البيانات بالكامل بنجاح وإرجاع كافة الطلاب والبيانات!');
        setTimeout(() => {
          window.location.reload();
        }, 2000);

      } catch (err) {
        console.error('Restore error:', err);
        setBackupMessage('❌ خطأ في استعادة النسخة الاحتياطية: ' + err.message);
      } finally {
        setRestoring(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSaveBackupEmail = async (newEmail) => {
    setBackupEmail(newEmail);
    localStorage.setItem('gradely_backup_email', newEmail);
    try {
      const { data: subData } = await supabase.from('subjects').select('id, excluded_students');
      if (subData && subData.length > 0) {
        for (const sub of subData) {
          const currentExcluded = Array.isArray(sub.excluded_students) ? sub.excluded_students : [];
          const kept = currentExcluded.filter(e => typeof e === 'string' && !e.startsWith('CONFIG_BACKUP_EMAIL:'));
          const updated = [...kept, 'CONFIG_BACKUP_EMAIL:' + newEmail];
          await supabase.from('subjects').update({ excluded_students: updated }).eq('id', sub.id);
        }
        cacheManager.invalidate('admin_subjects_base');
      }
      setBackupMessage('✅ تم حفظ البريد الإلكتروني للنسخ الدوري: ' + newEmail);
      setTimeout(() => setBackupMessage(''), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveWebhookUrl = (url) => {
    setWebhookScriptUrl(url);
    localStorage.setItem('gradely_webhook_url', url);
  };

  const handleSendEmailBackup = async () => {
    if (!backupEmail || !backupEmail.includes('@')) {
      alert('يرجى كتابة بريد إلكتروني صحيح أولاً (Gmail / Email)');
      return;
    }

    setSendingEmail(true);
    setBackupMessage('جاري استخراج وتجهيز كشوف الغياب المنظمة وإرسالها إلى (' + backupEmail + ')...');

    try {
      const [usersRes, subRes, attRes] = await Promise.all([
        supabase.from('users').select('id, user_id, name, role, year_level, section, assigned_subjects'),
        supabase.from('subjects').select('id, name, year_level, total_weeks, instructor_name, instructor_id, enrolled_students, excluded_students'),
        supabase.from('attendance').select('student_id, subject_id, week_number, status')
      ]);

      const allUsers = usersRes.data || [];
      const allSubs = subRes.data || [];
      const allAtt = attRes.data || [];

      const freshCurrentUser = allUsers.find(u => u.user_id === user.user_id) || user;
      const rawAssigned = Array.isArray(freshCurrentUser?.assigned_subjects) ? freshCurrentUser.assigned_subjects : [];
      const assignedSubIds = rawAssigned.map(e => e.split(':')[0]);

      let mySubs = [];
      if (isSuper) {
        mySubs = allSubs;
      } else {
        mySubs = allSubs.filter(s => 
          s.instructor_id === user.user_id || 
          s.instructor_name === user.name || 
          assignedSubIds.includes(s.id)
        );
      }

      if (mySubs.length === 0) {
        setBackupMessage('❌ لا توجد مواد مسندة لتصدير كشوفها');
        setSendingEmail(false);
        return;
      }

      const attMatrix = {};
      allAtt.forEach(r => {
        if (!attMatrix[r.subject_id]) attMatrix[r.subject_id] = {};
        if (!attMatrix[r.subject_id][r.student_id]) attMatrix[r.subject_id][r.student_id] = {};
        attMatrix[r.subject_id][r.student_id][r.week_number] = r.status;
      });

      const sheets = [];

      mySubs.forEach(sub => {
        const totalWeeks = sub.total_weeks || 12;
        const subAtt = attMatrix[sub.id] || {};

        const enrolled = allUsers.filter(u => {
          if (u.role !== 'student') return false;
          const inSub = Array.isArray(sub.enrolled_students) && sub.enrolled_students.includes(u.user_id);
          const hasAssigned = Array.isArray(u.assigned_subjects) && u.assigned_subjects.some(e => typeof e === 'string' && e.startsWith(sub.id + ':'));
          return inSub || hasAssigned;
        });

        const rows = enrolled.map(stu => {
          const stuSubSec = (() => {
            if (Array.isArray(stu.assigned_subjects)) {
              const m = stu.assigned_subjects.find(e => typeof e === 'string' && e.startsWith(sub.id + ':'));
              if (m) return m.split(':')[1];
            }
            return stu.section || 'S1';
          })();

          const row = {
            'الرقم الأكاديمي': stu.user_id,
            'اسم الطالب': stu.name,
            'السكشن': stuSubSec,
            'الفرقة': stu.year_level || sub.year_level || '1'
          };

          let presentCount = 0;
          let absentCount = 0;
          let lateCount = 0;
          let excusedCount = 0;

          for (let w = 1; w <= totalWeeks; w++) {
            const st = subAtt[stu.user_id]?.[w];
            let label = 'لم يرصد';
            if (st === 'present') { label = 'حاضر'; presentCount++; }
            else if (st === 'absent') { label = 'غائب'; absentCount++; }
            else if (st === 'late') { label = 'تأخير'; lateCount++; presentCount += 0.5; }
            else if (st === 'excused') { label = 'عذر'; excusedCount++; }
            row['أسبوع ' + w] = label;
          }

          const totalRecorded = presentCount + absentCount + (lateCount * 0.5);
          const attRate = totalRecorded > 0 ? Math.round((presentCount / totalRecorded) * 100) + '%' : '0%';

          row['إجمالي الحضور'] = presentCount;
          row['إجمالي الغياب'] = absentCount;
          row['تأخير / عذر'] = lateCount + excusedCount;
          row['نسبة الالتزام'] = attRate;

          return row;
        });

        let sheetName = sub.name.replace(/[:\/?*[\]]/g, '').slice(0, 28);
        if (!sheetName) sheetName = 'مادة ' + sub.id.slice(0, 6);
        sheets.push({ name: sheetName, data: rows });
      });

      // 2. Generate Base64 attachment
      const fileBase64 = await generateMultiSheetExcelBase64(sheets);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 10);
      const filename = 'Gradely_Attendance_Matrix_' + timestamp + '.xlsx';

      const targetWebhook = webhookScriptUrl.trim() || 'https://script.google.com/macros/s/AKfycbzBUNCHESyAtmUK_V8Wm7KV-8zdV3mmpoI8ACd6KHtLRBlhG7B28EiPKZVXf9SU7haiEQ/exec';

      // 3. Send to Google Apps Script Webhook
      const payload = JSON.stringify({
        email: backupEmail,
        filename: filename,
        fileBase64: fileBase64
      });

      await fetch(targetWebhook, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: payload
      });

      const nowIso = new Date().toLocaleString('ar-EG');
      setLastBackupDate(nowIso);
      localStorage.setItem('gradely_last_backup', nowIso);

      setBackupMessage('🎉 تم إرسال كشف الغياب المنظم بنجاح إلى (' + backupEmail + ') عبر Google Apps Script!');
      setTimeout(() => setBackupMessage(''), 9000);
    } catch (err) {
      console.error('Email backup error:', err);
      setBackupMessage('❌ حدث خطأ أثناء إرسال النسخة: ' + err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleScheduleChange = (val) => {
    setBackupSchedule(val);
    localStorage.setItem('gradely_backup_schedule', val);
    setBackupMessage('✅ تم حفظ جدول تذكير النسخ الاحتياطي');
    setTimeout(() => setBackupMessage(''), 3000);
  };

  const getColLabel = (key, fallback) => {
    return columnLabels[key] || fallback;
  };

  const handleOpenAddColumnModal = () => {
    setNewColumnName('');
    if (isSuper) {
      setNewColumnScope(selectedSubjectForVisibility || 'global');
    } else {
      const mySubs = allSubjectsList.filter(s => {
        const freshUser = (cacheManager.get('admin_users_base') || []).find(u => u.user_id === user.user_id) || user;
        const rawAss = Array.isArray(freshUser?.assigned_subjects) ? freshUser.assigned_subjects : [];
        const subIds = rawAss.map(e => e.split(':')[0]);
        return s.instructor_id === user.user_id || s.instructor_name === user.name || subIds.includes(s.id);
      });
      const defaultSubId = (selectedSubjectForVisibility !== 'global' && selectedSubjectForVisibility) ? selectedSubjectForVisibility : (mySubs[0]?.id || '');
      setNewColumnScope(defaultSubId);
    }
    setShowCustomColumnModal(true);
  };

  const handleAddCustomColumn = async (e) => {
    e.preventDefault();
    const trimName = newColumnName.trim();
    if (!trimName) return;

    const colKey = 'custom_' + Date.now();
    const newColObj = { 
      id: colKey, 
      label: trimName, 
      scope: newColumnScope || 'global',
      active: true 
    };
    const updatedCols = [...customColumnsList, newColObj];
    setCustomColumnsList(updatedCols);
    setNewColumnName('');

    // Enable in visibility settings
    const targetScopeKey = newColumnScope || 'global';
    const currentScopeVis = visibilitySettings[targetScopeKey] || {};
    const updatedScopeVis = { ...currentScopeVis, [colKey]: true };
    const updatedSettings = { ...visibilitySettings, [targetScopeKey]: updatedScopeVis };
    setVisibilitySettings(updatedSettings);

    try {
      const globalConfigStr = 'CONFIG:' + JSON.stringify(updatedSettings.global || {});
      const subConfigStr = 'CONFIG_SUB:' + JSON.stringify(updatedSettings);
      const colsConfigStr = 'CONFIG_CUSTOM_COLS:' + JSON.stringify(updatedCols);
      const labelsConfigStr = 'CONFIG_COL_LABELS:' + JSON.stringify(columnLabels);

      const { data: subData } = await supabase.from('subjects').select('id, excluded_students');
      if (subData && subData.length > 0) {
        for (const sub of subData) {
          const cleanExcluded = Array.isArray(sub.excluded_students) 
            ? sub.excluded_students.filter(x => typeof x === 'string' && !x.startsWith('CONFIG:') && !x.startsWith('CONFIG_SUB:') && !x.startsWith('CONFIG_CUSTOM_COLS:') && !x.startsWith('CONFIG_COL_LABELS:')) 
            : [];
          cleanExcluded.push(globalConfigStr);
          cleanExcluded.push(subConfigStr);
          cleanExcluded.push(colsConfigStr);
          cleanExcluded.push(labelsConfigStr);
          await supabase.from('subjects').update({ excluded_students: cleanExcluded }).eq('id', sub.id);
        }
      }
      cacheManager.invalidate('admin_subjects_base');
      setSettingsMessage('✅ تمت إضافة خانة الدرجة المخصصة بنجاح وتطبيقها حسب النطاق المحدد');
      setTimeout(() => setSettingsMessage(''), 3000);
      setShowCustomColumnModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveEditColumn = async (e) => {
    e.preventDefault();
    if (!editingColumn) return;
    const newLabel = editLabelInput.trim();
    if (!newLabel) return;

    const colId = editingColumn.id;
    const targetScope = selectedSubjectForVisibility || 'global';
    const updatedLabels = { ...columnLabels };

    if (targetScope !== 'global') {
      if (!updatedLabels[targetScope]) updatedLabels[targetScope] = {};
      updatedLabels[targetScope][colId] = newLabel;
    } else {
      updatedLabels[colId] = newLabel;
    }

    setColumnLabels(updatedLabels);

    let updatedCols = customColumnsList;
    if (!editingColumn.isDefault) {
      updatedCols = customColumnsList.map(c => c.id === editingColumn.id ? { ...c, label: newLabel, scope: editingColumn.scope } : c);
      setCustomColumnsList(updatedCols);
    }

    try {
      const colsConfigStr = 'CONFIG_CUSTOM_COLS:' + JSON.stringify(updatedCols);
      const labelsConfigStr = 'CONFIG_COL_LABELS:' + JSON.stringify(updatedLabels);

      const { data: subData } = await supabase.from('subjects').select('id, excluded_students');
      if (subData && subData.length > 0) {
        for (const sub of subData) {
          const cleanExcluded = Array.isArray(sub.excluded_students) 
            ? sub.excluded_students.filter(x => typeof x === 'string' && !x.startsWith('CONFIG_CUSTOM_COLS:') && !x.startsWith('CONFIG_COL_LABELS:')) 
            : [];
          cleanExcluded.push(colsConfigStr);
          cleanExcluded.push(labelsConfigStr);
          await supabase.from('subjects').update({ excluded_students: cleanExcluded }).eq('id', sub.id);
        }
      }
      cacheManager.invalidate('admin_subjects_base');
      setSettingsMessage('✅ تم تعديل وحفظ اسم الخانة بنجاح');
      setTimeout(() => setSettingsMessage(''), 3000);
      setEditingColumn(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCustomColumn = async (colId) => {
    if (!window.confirm('هل تريد حذف هذه الخانة المخصصة نهائياً؟')) return;
    const updatedCols = customColumnsList.filter(c => c.id !== colId);
    setCustomColumnsList(updatedCols);

    try {
      const colsConfigStr = 'CONFIG_CUSTOM_COLS:' + JSON.stringify(updatedCols);
      const { data: subData } = await supabase.from('subjects').select('id, excluded_students');
      if (subData && subData.length > 0) {
        for (const sub of subData) {
          const cleanExcluded = Array.isArray(sub.excluded_students) 
            ? sub.excluded_students.filter(x => typeof x === 'string' && !x.startsWith('CONFIG_CUSTOM_COLS:')) 
            : [];
          cleanExcluded.push(colsConfigStr);
          await supabase.from('subjects').update({ excluded_students: cleanExcluded }).eq('id', sub.id);
        }
      }
      cacheManager.invalidate('admin_subjects_base');
      setEditingColumn(null);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div style={{padding:'3rem',textAlign:'center',color:'var(--text-muted)'}}>جاري تحميل مؤشرات النظام...</div>;
  }

  return (
    <div className="fade-in">
      <div style={{marginBottom:'2rem'}}>
        <h2 style={{margin:0,fontSize:'1.6rem',fontWeight:800}}>نظرة عامة ومؤشرات النظام</h2>
        <p className="text-muted" style={{margin:'5px 0 0 0'}}>
          {isSuper ? 'إحصائيات كاملة لكافة الفرق والمقررات المسجلة في النظام' : 'إحصائيات المقررات والسكاشن المسندة إليك'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid-cards" style={{marginBottom:'2.5rem',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))'}}>
        <div className="panel" style={{display:'flex',alignItems:'center',gap:'1.2rem',borderTop:'4px solid var(--primary)'}}>
          <div style={{background:'rgba(79, 70, 229, 0.1)',padding:'1rem',borderRadius:'50%',color:'var(--primary-hover)'}}>
            <Users size={28} />
          </div>
          <div>
            <p className="text-muted" style={{margin:'0 0 4px 0',fontSize:'0.9rem'}}>
              {isSuper ? 'إجمالي الطلاب المقيدين' : 'طلاب المقررات المسندة'}
            </p>
            <h3 style={{margin:0,fontSize:'1.8rem',fontWeight:800}}>{stats.totalStudents} طالب</h3>
          </div>
        </div>

        <div className="panel" style={{display:'flex',alignItems:'center',gap:'1.2rem',borderTop:'4px solid #10b981'}}>
          <div style={{background:'rgba(16, 185, 129, 0.1)',padding:'1rem',borderRadius:'50%',color:'#10b981'}}>
            <BookOpen size={28} />
          </div>
          <div>
            <p className="text-muted" style={{margin:'0 0 4px 0',fontSize:'0.9rem'}}>المواد المتاحة</p>
            <h3 style={{margin:0,fontSize:'1.8rem',fontWeight:800}}>{stats.totalSubjects} مادة</h3>
          </div>
        </div>

        {isSuper && (
          <div className="panel" style={{display:'flex',alignItems:'center',gap:'1.2rem',borderTop:'4px solid #f59e0b'}}>
            <div style={{background:'rgba(245, 158, 11, 0.1)',padding:'1rem',borderRadius:'50%',color:'#f59e0b'}}>
              <Shield size={28} />
            </div>
            <div>
              <p className="text-muted" style={{margin:'0 0 4px 0',fontSize:'0.9rem'}}>هيئة التدريس والمعيدين</p>
              <h3 style={{margin:0,fontSize:'1.8rem',fontWeight:800}}>{stats.totalAdmins} معيد</h3>
            </div>
          </div>
        )}

        <div className="panel" style={{display:'flex',alignItems:'center',gap:'1.2rem',borderTop:'4px solid #3b82f6'}}>
          <div style={{background:'rgba(59, 130, 246, 0.1)',padding:'1rem',borderRadius:'50%',color:'#3b82f6'}}>
            <Clock size={28} />
          </div>
          <div>
            <p className="text-muted" style={{margin:'0 0 4px 0',fontSize:'0.9rem'}}>حالة النظام والبيانات</p>
            <h3 style={{margin:0,fontSize:'1.3rem',fontWeight:800,color:'var(--success)'}}>{stats.lastUpdate}</h3>
          </div>
        </div>
      </div>

      
      {/* TA & INSTRUCTOR COURSES & SECTIONS MATRIX BREAKDOWN DASHBOARD */}
      <div className="panel fade-in" style={{marginBottom:'2.5rem',border:'1px solid var(--border)',padding:'1.5rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.2rem',borderBottom:'1px solid var(--border)',paddingBottom:'1rem',flexWrap:'wrap',gap:'1rem'}}>
          <div>
            <h3 style={{margin:'0 0 4px 0',fontSize:'1.3rem',display:'flex',alignItems:'center',gap:'8px',color:'var(--primary-hover)'}}>
              <BookOpen size={22} /> {isSuper ? 'توزيع المقررات والسكاشن وأعداد الطلاب (لوحة التحكم الشاملة)' : 'لوحة متابعة مقرراتي وسكاشني وأعداد الطلاب'}
            </h3>
            <p className="text-muted" style={{margin:0,fontSize:'0.85rem'}}>
              {isSuper 
                ? 'استعراض تفصيلي لكافة المواد المسجلة بالكلية، السكاشن التابعة لها، المعيد المسؤول عن كل سكشن، وعدد الطلاب بدقة:'
                : 'نظرة سريعة على المواد والسكاشن المسندة إليك وتوزيع أعداد الطلاب في كل سكشن:'}
            </p>
          </div>
          <span className="badge" style={{background:'rgba(79,70,229,0.1)',color:'var(--primary-hover)',padding:'6px 14px',borderRadius:'20px',fontWeight:700}}>
            {(isSuper ? allSubjectsList : allSubjectsList.filter(s => {
              const freshUser = (cacheManager.get('admin_users_base') || []).find(u => u.user_id === user.user_id) || user;
              const rawAss = Array.isArray(freshUser?.assigned_subjects) ? freshUser.assigned_subjects : [];
              const subIds = rawAss.map(e => e.split(':')[0]);
              return s.instructor_id === user.user_id || s.instructor_name === user.name || subIds.includes(s.id);
            })).length} مواد دراسية
          </span>
        </div>

        {/* Subjects & Sections Breakdown Grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))',gap:'1.2rem'}}>
          {(isSuper ? allSubjectsList : allSubjectsList.filter(s => {
            const freshUser = (cacheManager.get('admin_users_base') || []).find(u => u.user_id === user.user_id) || user;
            const rawAss = Array.isArray(freshUser?.assigned_subjects) ? freshUser.assigned_subjects : [];
            const subIds = rawAss.map(e => e.split(':')[0]);
            return s.instructor_id === user.user_id || s.instructor_name === user.name || subIds.includes(s.id);
          })).map(sub => {
            const enrolled = allStudentsList.filter(stu => {
              const inSub = Array.isArray(sub.enrolled_students) && sub.enrolled_students.includes(stu.user_id);
              const hasAss = Array.isArray(stu.assigned_subjects) && stu.assigned_subjects.some(e => typeof e === 'string' && e.startsWith(sub.id + ':'));
              return inSub || hasAss;
            });

            const sectionsMap = {};
            enrolled.forEach(stu => {
              let sec = 'S1';
              if (Array.isArray(stu.assigned_subjects)) {
                const m = stu.assigned_subjects.find(e => typeof e === 'string' && e.startsWith(sub.id + ':'));
                if (m) sec = normalizeSection(m.split(':')[1]);
                else sec = normalizeSection(stu.section || 'S1');
              } else {
                sec = normalizeSection(stu.section || 'S1');
              }
              if (!sectionsMap[sec]) sectionsMap[sec] = [];
              sectionsMap[sec].push(stu);
            });

            // Also include any sections from TA assignments that might have 0 students yet
            allAdminsList.forEach(adm => {
              if (Array.isArray(adm.assigned_subjects)) {
                adm.assigned_subjects.forEach(entry => {
                  if (typeof entry === 'string' && entry.startsWith(sub.id + ':')) {
                    const sec = normalizeSection(entry.split(':')[1]);
                    if (!sectionsMap[sec]) sectionsMap[sec] = [];
                  }
                });
              }
            });

            const sortedSecKeys = Object.keys(sectionsMap).sort((a, b) => {
              const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
              const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
              return numA - numB;
            });

            return (
              <div key={sub.id} style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'10px',padding:'16px',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
                <div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                    <h4 style={{margin:0,fontSize:'1.1rem',color:'var(--text-main)',fontWeight:800}}>
                      {sub.name}
                    </h4>
                    <span style={{fontSize:'0.75rem',background:'rgba(255,255,255,0.06)',padding:'3px 8px',borderRadius:'4px',color:'var(--text-muted)'}}>
                      الفرقة {sub.year_level || '1'}
                    </span>
                  </div>

                  <div style={{fontSize:'0.85rem',color:'var(--text-muted)',marginBottom:'12px',display:'flex',justifyContent:'space-between'}}>
                    <span>إجمالي الطلاب: <strong style={{color:'var(--text-main)'}}>{enrolled.length} طالب</strong></span>
                    <span>السكاشن: <strong style={{color:'var(--primary-hover)'}}>{sortedSecKeys.length} سكشن</strong></span>
                  </div>

                  {/* Section Badges */}
                  <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                    {sortedSecKeys.map(sec => {
                      const count = sectionsMap[sec]?.length || 0;
                      const ta = getSectionInstructorName(sub.id, sec);
                      const isMySec = !isSuper && (ta === user.name || ta === user.user_id);
                      return (
                        <div 
                          key={sec}
                          style={{
                            background: isMySec ? 'rgba(79, 70, 229, 0.15)' : 'rgba(255,255,255,0.02)',
                            border: isMySec ? '1px solid var(--primary-hover)' : '1px solid rgba(255,255,255,0.06)',
                            borderRadius:'6px',padding:'8px 12px',display:'flex',justifyContent:'space-between',alignItems:'center'
                          }}
                        >
                          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                            <span style={{fontWeight:800,color:'var(--primary-hover)',fontFamily:'monospace',fontSize:'0.9rem'}}>
                              [{sec}] سكشن {sec.replace(/\D/g, '')}
                            </span>
                            <span style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>
                              • المعيد: <strong style={{color:'var(--text-main)'}}>{ta}</strong>
                            </span>
                          </div>
                          <span style={{fontSize:'0.82rem',fontWeight:700,color:'var(--success)',background:'rgba(16,185,129,0.1)',padding:'2px 8px',borderRadius:'12px'}}>
                            {count} طالب
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* STUDENT DASHBOARD VISIBILITY & ASSESSMENT CONTROLS (SUPER ADMIN & TAs) */}
      <div className="panel fade-in" style={{border:'1px solid var(--primary)',marginBottom:'2.5rem',padding:'1.5rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.2rem',flexWrap:'wrap',gap:'1rem',borderBottom:'1px solid var(--border)',paddingBottom:'1rem'}}>
            <div>
              <h3 style={{margin:'0 0 4px 0',fontSize:'1.3rem',display:'flex',alignItems:'center',gap:'8px',color:'var(--primary-hover)'}}>
                <Sliders size={22} /> التحكم بظهور درجات وبيانات صفحة الطالب (مخصص لكل مادة)
              </h3>
              <p className="text-muted" style={{margin:0,fontSize:'0.85rem'}}>
                اختر المادة وحدد بدقة أي درجة أو سجل تريد إظهاره أو إخفاءه عن الطلاب:
              </p>
            </div>
            {settingsMessage && (
              <span style={{color: settingsMessage.startsWith('✅') ? 'var(--success)' : 'var(--danger)', fontWeight:'bold', fontSize:'0.9rem'}}>
                {settingsMessage}
              </span>
            )}
          </div>

          {/* Subject Scope Selector */}
          <div style={{marginBottom:'1.5rem',display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
            <label style={{fontWeight:700,fontSize:'0.95rem'}}>تطبيق الإعدادات على:</label>
            <select 
              className="input-field" 
              value={selectedSubjectForVisibility} 
              onChange={e => setSelectedSubjectForVisibility(e.target.value)}
              style={{maxWidth:'320px',padding:'8px 12px',fontWeight:'bold'}}
            >
              {isSuper && <option value="global">🌐 الإعداد الافتراضي العام (كافة المواد)</option>}
              {(isSuper ? allSubjectsList : allSubjectsList.filter(s => {
                const freshUser = (cacheManager.get('admin_users_base') || []).find(u => u.user_id === user.user_id) || user;
                const rawAss = Array.isArray(freshUser?.assigned_subjects) ? freshUser.assigned_subjects : [];
                const subIds = rawAss.map(e => e.split(':')[0]);
                return s.instructor_id === user.user_id || s.instructor_name === user.name || subIds.includes(s.id);
              })).map(s => (
                <option key={s.id} value={s.id}>
                  📚 مادة: {s.name} (الفرقة {s.year_level})
                </option>
              ))}
            </select>
            {selectedSubjectForVisibility !== 'global' && (
              <span className="badge" style={{background:'rgba(79, 70, 229, 0.1)',color:'var(--primary-hover)'}}>
                تخصيص لمادة محددة
              </span>
            )}
          </div>

          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'1rem'}}>
            <button 
              className="btn-secondary" 
              onClick={handleOpenAddColumnModal}
              style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.85rem',color:'var(--primary-hover)',borderColor:'rgba(79, 70, 229, 0.4)'}}
            >
              ➕ إضافة / تعديل خانة درجات جديدة
            </button>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:'1rem'}}>
            
            <div 
              onClick={() => handleToggleVisibility('showQuiz1')}
              style={{
                background: currentActiveVisibility.showQuiz1 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: currentActiveVisibility.showQuiz1 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius:'8px',padding:'12px 14px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
              }}
            >
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                  <div style={{fontWeight:700,fontSize:'0.9rem',color: currentActiveVisibility.showQuiz1 ? 'var(--success)' : 'var(--text-muted)'}}>
                    {getColLabel('showQuiz1', 'كويز 1')}
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingColumn({ id: 'showQuiz1', label: getColLabel('showQuiz1', 'كويز 1'), isDefault: true }); setEditLabelInput(getColLabel('showQuiz1', 'كويز 1')); }}
                    style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',padding:'2px',display:'flex'}}
                    title="تعديل اسم الخانة"
                  >
                    <Edit size={13} />
                  </button>
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {currentActiveVisibility.showQuiz1 ? 'ظاهر للطلاب' : 'مخفي'}
                </div>
              </div>
              {currentActiveVisibility.showQuiz1 ? <Eye size={18} style={{color:'var(--success)'}} /> : <EyeOff size={18} style={{color:'var(--danger)'}} />}
            </div>

            <div 
              onClick={() => handleToggleVisibility('showQuiz2')}
              style={{
                background: currentActiveVisibility.showQuiz2 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: currentActiveVisibility.showQuiz2 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius:'8px',padding:'12px 14px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
              }}
            >
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                  <div style={{fontWeight:700,fontSize:'0.9rem',color: currentActiveVisibility.showQuiz2 ? 'var(--success)' : 'var(--text-muted)'}}>
                    {getColLabel('showQuiz2', 'كويز 2')}
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingColumn({ id: 'showQuiz2', label: getColLabel('showQuiz2', 'كويز 2'), isDefault: true }); setEditLabelInput(getColLabel('showQuiz2', 'كويز 2')); }}
                    style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',padding:'2px',display:'flex'}}
                    title="تعديل اسم الخانة"
                  >
                    <Edit size={13} />
                  </button>
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {currentActiveVisibility.showQuiz2 ? 'ظاهر للطلاب' : 'مخفي'}
                </div>
              </div>
              {currentActiveVisibility.showQuiz2 ? <Eye size={18} style={{color:'var(--success)'}} /> : <EyeOff size={18} style={{color:'var(--danger)'}} />}
            </div>

            <div 
              onClick={() => handleToggleVisibility('showProject')}
              style={{
                background: currentActiveVisibility.showProject ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: currentActiveVisibility.showProject ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius:'8px',padding:'12px 14px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
              }}
            >
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                  <div style={{fontWeight:700,fontSize:'0.9rem',color: currentActiveVisibility.showProject ? 'var(--success)' : 'var(--text-muted)'}}>
                    {getColLabel('showProject', 'المشروع / العملي')}
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingColumn({ id: 'showProject', label: getColLabel('showProject', 'المشروع / العملي'), isDefault: true }); setEditLabelInput(getColLabel('showProject', 'المشروع / العملي')); }}
                    style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',padding:'2px',display:'flex'}}
                    title="تعديل اسم الخانة"
                  >
                    <Edit size={13} />
                  </button>
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {currentActiveVisibility.showProject ? 'ظاهر للطلاب' : 'مخفي'}
                </div>
              </div>
              {currentActiveVisibility.showProject ? <Eye size={18} style={{color:'var(--success)'}} /> : <EyeOff size={18} style={{color:'var(--danger)'}} />}
            </div>

            <div 
              onClick={() => handleToggleVisibility('showAttendanceScore')}
              style={{
                background: currentActiveVisibility.showAttendanceScore ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: currentActiveVisibility.showAttendanceScore ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius:'8px',padding:'12px 14px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
              }}
            >
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                  <div style={{fontWeight:700,fontSize:'0.9rem',color: currentActiveVisibility.showAttendanceScore ? 'var(--success)' : 'var(--text-muted)'}}>
                    {getColLabel('showAttendanceScore', 'درجة الحضور')}
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingColumn({ id: 'showAttendanceScore', label: getColLabel('showAttendanceScore', 'درجة الحضور'), isDefault: true }); setEditLabelInput(getColLabel('showAttendanceScore', 'درجة الحضور')); }}
                    style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',padding:'2px',display:'flex'}}
                    title="تعديل اسم الخانة"
                  >
                    <Edit size={13} />
                  </button>
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {currentActiveVisibility.showAttendanceScore ? 'ظاهر للطلاب' : 'مخفي'}
                </div>
              </div>
              {currentActiveVisibility.showAttendanceScore ? <Eye size={18} style={{color:'var(--success)'}} /> : <EyeOff size={18} style={{color:'var(--danger)'}} />}
            </div>

            <div 
              onClick={() => handleToggleVisibility('showTotal')}
              style={{
                background: currentActiveVisibility.showTotal ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: currentActiveVisibility.showTotal ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius:'8px',padding:'12px 14px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
              }}
            >
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                  <div style={{fontWeight:700,fontSize:'0.9rem',color: currentActiveVisibility.showTotal ? 'var(--success)' : 'var(--text-muted)'}}>
                    {getColLabel('showTotal', 'المجموع الكلي')}
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingColumn({ id: 'showTotal', label: getColLabel('showTotal', 'المجموع الكلي'), isDefault: true }); setEditLabelInput(getColLabel('showTotal', 'المجموع الكلي')); }}
                    style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',padding:'2px',display:'flex'}}
                    title="تعديل اسم الخانة"
                  >
                    <Edit size={13} />
                  </button>
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {currentActiveVisibility.showTotal ? 'ظاهر للطلاب' : 'مخفي'}
                </div>
              </div>
              {currentActiveVisibility.showTotal ? <Eye size={18} style={{color:'var(--success)'}} /> : <EyeOff size={18} style={{color:'var(--danger)'}} />}
            </div>

            {customColumnsList
              .filter(col => col.scope === 'global' || col.scope === selectedSubjectForVisibility)
              .map(col => {
                const isColActive = currentActiveVisibility[col.id] !== false;
                const displayLabel = getColLabel(col.id, col.label);
                const scopeSub = allSubjectsList.find(s => s.id === col.scope);
                return (
                  <div 
                    key={col.id}
                    onClick={() => handleToggleVisibility(col.id)}
                    style={{
                      background: isColActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                      border: isColActive ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius:'8px',padding:'12px 14px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
                    }}
                  >
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        <div style={{fontWeight:700,fontSize:'0.9rem',color: isColActive ? 'var(--success)' : 'var(--text-muted)'}}>
                          {displayLabel}
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditingColumn({ id: col.id, label: displayLabel, scope: col.scope, isDefault: false }); setEditLabelInput(displayLabel); }}
                          style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',padding:'2px',display:'flex'}}
                          title="تعديل اسم الخانة"
                        >
                          <Edit size={13} />
                        </button>
                      </div>
                      <div style={{fontSize:'0.75rem',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:'4px'}}>
                        <span>{isColActive ? 'ظاهر للطلاب' : 'مخفي'}</span>
                        <span style={{color:'var(--primary-hover)'}}>({col.scope === 'global' ? 'عام' : scopeSub ? scopeSub.name : 'مخصص'})</span>
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      {isColActive ? <Eye size={18} style={{color:'var(--success)'}} /> : <EyeOff size={18} style={{color:'var(--danger)'}} />}
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteCustomColumn(col.id); }} 
                        style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:'0.85rem',padding:'2px'}}
                        title="حذف هذه الخانة نهائياً"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
            })}

            <div 
              onClick={() => handleToggleVisibility('showAttendanceTab')}
              style={{
                background: currentActiveVisibility.showAttendanceTab ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: currentActiveVisibility.showAttendanceTab ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius:'8px',padding:'12px 14px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
              }}
            >
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                  <div style={{fontWeight:700,fontSize:'0.9rem',color: currentActiveVisibility.showAttendanceTab ? 'var(--success)' : 'var(--text-muted)'}}>
                    {getColLabel('showAttendanceTab', 'سجل الأسابيع')}
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingColumn({ id: 'showAttendanceTab', label: getColLabel('showAttendanceTab', 'سجل الأسابيع'), isDefault: true }); setEditLabelInput(getColLabel('showAttendanceTab', 'سجل الأسابيع')); }}
                    style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',padding:'2px',display:'flex'}}
                    title="تعديل اسم الخانة"
                  >
                    <Edit size={13} />
                  </button>
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {currentActiveVisibility.showAttendanceTab ? 'ظاهر للطلاب' : 'مخفي'}
                </div>
              </div>
              {currentActiveVisibility.showAttendanceTab ? <Eye size={18} style={{color:'var(--success)'}} /> : <EyeOff size={18} style={{color:'var(--danger)'}} />}
            </div>

          </div>
        </div>

      {/* SUPER ADMIN: FULL SYSTEM BACKUP & RESTORE TOOL */}
      {isSuper && (
        <div className="panel fade-in" style={{border:'1px solid var(--border)',padding:'1.5rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.2rem',flexWrap:'wrap',gap:'1rem',borderBottom:'1px solid var(--border)',paddingBottom:'1rem'}}>
            <div>
              <h3 style={{margin:'0 0 4px 0',fontSize:'1.3rem',display:'flex',alignItems:'center',gap:'8px',color:'var(--success)'}}>
                <Database size={22} /> مركز النسخ الاحتياطي الشامل واستعادة النظام (Full System Backup & Restore)
              </h3>
              <p className="text-muted" style={{margin:0,fontSize:'0.85rem'}}>
                حفظ شامل لكافة جداول النظام (الطلاب، المواد، كشف الغياب الكامل لكافة الأسابيع، والدرجات) في ملف واحد:
              </p>
            </div>
            {backupMessage && (
              <span style={{color: backupMessage.startsWith('✅') || backupMessage.startsWith('🎉') ? 'var(--success)' : 'var(--danger)', fontWeight:'bold', fontSize:'0.9rem'}}>
                {backupMessage}
              </span>
            )}
          </div>

          {/* Automated Scheduled Email & Cloud Backup Configuration */}
          <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'10px',padding:'16px 20px',marginBottom:'1.5rem',display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))',gap:'1.2rem',alignItems:'center'}}>
            
            {/* Email Input */}
            <div>
              <label style={{display:'block',marginBottom:'6px',fontSize:'0.85rem',fontWeight:700,color:'var(--primary-hover)'}}>
                📧 البريد الإلكتروني لاستلام كشوف الغياب الدورية (Gmail / Email):
              </label>
              <div style={{display:'flex',gap:'8px'}}>
                <input 
                  type="email" 
                  className="input-field" 
                  placeholder="admin@university.edu.eg" 
                  value={backupEmail} 
                  onChange={e => setBackupEmail(e.target.value)}
                  onBlur={e => handleSaveBackupEmail(e.target.value)}
                  style={{fontSize:'0.9rem',padding:'8px 12px'}}
                />
                <button 
                  className="btn-secondary" 
                  onClick={() => handleSaveBackupEmail(backupEmail)}
                  style={{whiteSpace:'nowrap',fontSize:'0.85rem',padding:'8px 12px'}}
                >
                  حفظ
                </button>
              </div>
            </div>

            {/* Schedule Selector */}
            <div>
              <label style={{display:'block',marginBottom:'6px',fontSize:'0.85rem',fontWeight:700,color:'var(--text-main)'}}>
                ⏰ جدولة تكرار إرسال التقرير:
              </label>
              <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                <select className="input-field" value={backupSchedule} onChange={e=>handleScheduleChange(e.target.value)} style={{padding:'8px 12px',fontSize:'0.9rem'}}>
                  <option value="daily">📅 يومياً (Daily - كل 24 ساعة)</option>
                  <option value="3days">📅 كل 3 أيام (كل 72 ساعة)</option>
                  <option value="weekly">📅 أسبوعياً (كل 7 أيام - نهاية كل أسبوع)</option>
                  <option value="monthly">📅 شهرياً (Monthly - نهاية كل شهر)</option>
                </select>
              </div>
            </div>

            {/* Last Backup Status */}
            <div style={{background:'rgba(255,255,255,0.02)',padding:'10px 14px',borderRadius:'8px',border:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:'4px'}}>
              <span style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>حالة النسخ الاحتياطي:</span>
              <span style={{fontSize:'0.85rem',fontWeight:700,color: lastBackupDate ? 'var(--success)' : 'var(--warning)'}}>
                آخر إرسال/تصدير: {lastBackupDate || 'لم يتم التصدير بعد'}
              </span>
              <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                التكرار النشط: {backupSchedule === 'daily' ? 'يومياً' : backupSchedule === '3days' ? 'كل 3 أيام' : backupSchedule === 'weekly' ? 'أسبوعياً' : 'شهرياً'}
              </span>
            </div>

          </div>

          <div style={{display:'flex',gap:'1rem',flexWrap:'wrap',alignItems:'center'}}>
            <button 
              className="btn-primary" 
              onClick={handleSendEmailBackup} 
              disabled={backingUp || restoring || sendingEmail}
              style={{background:'linear-gradient(135deg, #10b981 0%, #059669 100%)',borderColor:'#059669',display:'flex',alignItems:'center',gap:'8px',padding:'10px 18px',fontSize:'0.95rem',fontWeight:800}}
              title="إرسال كشوف الغياب المنظمة وتنزيلها فوراً وفق البريد والجدولة المحددة"
            >
              📧 {sendingEmail ? 'جاري التجهيز والإرسال...' : 'إرسال كشف الغياب الآن إلى البريد (Email / Drive)'}
            </button>
            <button 
              className="btn-primary" 
              onClick={() => handleFullBackup('json')} 
              disabled={backingUp || restoring}
              style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 18px',fontSize:'0.95rem'}}
              title="نسخة شاملة تحتوي على كل الجداول والطلاب والغياب والدرجات لاستعادتها في أي وقت"
            >
              <Download size={18} /> {backingUp ? 'جاري إنشاء النسخة...' : 'تحميل نسخة احتياطية كاملة (JSON)'}
            </button>

            <button 
              className="btn-primary" 
              onClick={handleAttendanceMatrixBackup} 
              disabled={backingUp || restoring}
              style={{background:'var(--primary)',display:'flex',alignItems:'center',gap:'8px',padding:'10px 18px',fontSize:'0.95rem',fontWeight:800}}
              title="تصدير كشف غياب منظم بنظام الجدول الأسبوعي لكل مادة (الأسابيع 1-12 ونسب الحضور)"
            >
              <FileSpreadsheet size={18} /> 📊 تصدير كشوف الغياب المنظمة (مصفوفة الأسابيع لكل مادة)
            </button>
            <button 
              className="btn-secondary" 
              onClick={() => handleFullBackup('excel')} 
              disabled={backingUp || restoring}
              style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 18px',fontSize:'0.95rem',color:'var(--success)',borderColor:'rgba(16,185,129,0.4)'}}
              title="شيت إكسيل متعدد الصفحات يحتوي على كافة المواد وغياب كل الأسابيع والدرجات"
            >
              <Download size={18} /> تحميل نسخة النظام الشاملة (Excel)
            </button>

            <label className="btn-secondary" style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 18px',fontSize:'0.95rem',cursor:'pointer',borderColor:'#f59e0b',color:'#f59e0b'}}>
              <Upload size={18} /> {restoring ? 'جاري استعادة النظام...' : 'استعادة النظام من نسخة احتياطية (JSON)'}
              <input type="file" accept=".json" onChange={handleRestoreFromFile} style={{display:'none'}} disabled={restoring} />
            </label>
          </div>
        </div>
      )}

      {/* ADD CUSTOM COLUMN MODAL */}
      {showCustomColumnModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem'
        }}>
          <div className="panel fade-in" style={{maxWidth: '480px', width: '100%'}}>
            <h3 style={{margin:'0 0 1rem 0',fontSize:'1.2rem',color:'var(--primary-hover)',fontWeight:800}}>
              ➕ إضافة خانة درجات / أعمال سنة جديدة
            </h3>
            <form onSubmit={handleAddCustomColumn} style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
              <div>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>اسم الخانة الجديدة:</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="مثال: امتحان العملي، الميدترم، درجات الشفوي، كويز 3..." 
                  value={newColumnName} 
                  onChange={e => setNewColumnName(e.target.value)} 
                  required 
                  autoFocus 
                  style={{width:'100%',padding:'10px'}}
                />
              </div>

              <div>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>تطبيق هذه الخانة على:</label>
                <select 
                  className="input-field" 
                  value={newColumnScope} 
                  onChange={e => setNewColumnScope(e.target.value)}
                  style={{width:'100%',padding:'10px',fontWeight:'bold'}}
                >
                  {isSuper && <option value="global">🌐 الإعداد العام (كافة المواد)</option>}
                  {(isSuper ? allSubjectsList : allSubjectsList.filter(s => {
                    const freshUser = (cacheManager.get('admin_users_base') || []).find(u => u.user_id === user.user_id) || user;
                    const rawAss = Array.isArray(freshUser?.assigned_subjects) ? freshUser.assigned_subjects : [];
                    const subIds = rawAss.map(e => e.split(':')[0]);
                    return s.instructor_id === user.user_id || s.instructor_name === user.name || subIds.includes(s.id);
                  })).map(s => (
                    <option key={s.id} value={s.id}>
                      📚 مادة محددة: {s.name} (الفرقة {s.year_level})
                    </option>
                  ))}
                </select>
                <span style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:'4px',display:'block'}}>
                  عند تحديد مادة محددة، ستظهر هذه الخانة فقط لطلاب تلك المادة دون التأثير على باقي المواد.
                </span>
              </div>

              <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'0.5rem'}}>
                <button type="button" className="btn-secondary" onClick={() => setShowCustomColumnModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn-primary">
                  إضافة وتفعيل الخانة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT COLUMN MODAL */}
      {editingColumn && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem'
        }}>
          <div className="panel fade-in" style={{maxWidth: '460px', width: '100%'}}>
            <h3 style={{margin:'0 0 1rem 0',fontSize:'1.2rem',color:'var(--primary-hover)',fontWeight:800}}>
              ✏️ تعديل اسم وبيانات الخانة
            </h3>
            <form onSubmit={handleSaveEditColumn} style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
              <div>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>الاسم المعروض للطلاب:</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editLabelInput} 
                  onChange={e => setEditLabelInput(e.target.value)} 
                  required 
                  autoFocus 
                  style={{width:'100%',padding:'10px'}}
                />
              </div>

              {!editingColumn.isDefault && (
                <div>
                  <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>نطاق المادة:</label>
                  <select 
                    className="input-field" 
                    value={editingColumn.scope || 'global'} 
                    onChange={e => setEditingColumn(prev => ({ ...prev, scope: e.target.value }))}
                    style={{width:'100%',padding:'10px'}}
                  >
                    <option value="global">🌐 الإعداد العام (كافة المواد)</option>
                    {allSubjectsList.map(s => (
                      <option key={s.id} value={s.id}>
                        📚 مادة: {s.name} (الفرقة {s.year_level})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'0.5rem'}}>
                {!editingColumn.isDefault ? (
                  <button 
                    type="button" 
                    onClick={() => handleDeleteCustomColumn(editingColumn.id)} 
                    className="btn-secondary" 
                    style={{color:'var(--danger)',borderColor:'rgba(239, 68, 68, 0.3)'}}
                  >
                    <Trash2 size={16} /> حذف الخانة
                  </button>
                ) : <div />}

                <div style={{display:'flex',gap:'10px'}}>
                  <button type="button" className="btn-secondary" onClick={() => setEditingColumn(null)}>
                    إلغاء
                  </button>
                  <button type="submit" className="btn-primary">
                    حفظ التعديل
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
