import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { parseExcelFile, exportExcelFile } from '../../utils/excelHelper';
import { printStudentCredentialsSlips } from '../../utils/pdfHelper';
import { cacheManager, isSuperUser } from '../../utils/dataCache';
import { Users, Upload, UserPlus, Edit, Trash2, Search, Shield, GraduationCap, X, ChevronDown, KeyRound, Filter, CheckSquare, Square, BookOpen, Lock, Download, FileSpreadsheet, Info, Printer, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function StudentsTab({ user }) {
  const [allUsers, setAllUsers] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState('students'); // 'students' or 'admins'
  
  // Modals visibility
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [importTargetSubject, setImportTargetSubject] = useState('');

  // Credentials Generator State
  const [credentialsScope, setCredentialsScope] = useState('all');
  const [passwordFormat, setPasswordFormat] = useState('alphanumeric8');
  const [generatedCredentials, setGeneratedCredentials] = useState([]);
  const [isGeneratingCreds, setIsGeneratingCreds] = useState(false);
  const [syncCredsProgress, setSyncCredsProgress] = useState({ current: 0, total: 0 });
  const [credsMessage, setCredsMessage] = useState('');

  const isSuper = isSuperUser(user);

  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  
  // Form states
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [addingType, setAddingType] = useState('student');
  const [yearLevel, setYearLevel] = useState('1');
  const [section, setSection] = useState('S1');
  const [assignedSubjects, setAssignedSubjects] = useState([]); // for TAs
  const [selectedEnrollSubjects, setSelectedEnrollSubjects] = useState([]); // for students
  const [editMode, setEditMode] = useState(false);
  const [submittingUser, setSubmittingUser] = useState(false);
  const [modalError, setModalError] = useState('');

  // Student Filters
  const [studentSearch, setStudentSearch] = useState('');
  const [studentYearFilter, setStudentYearFilter] = useState('all');
  const [studentSectionFilter, setStudentSectionFilter] = useState('all');

  // Bulk Selection
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);

  const normalizeYear = (yr) => {
    if (!yr) return '1';
    const s = yr.toString().trim();
    // Direct number
    const numMatch = s.match(/\d+/);
    if (numMatch) {
      const n = parseInt(numMatch[0], 10);
      if (n >= 1 && n <= 6) return String(n);
    }
    // Arabic text
    if (/أول|الأولى/i.test(s)) return '1';
    if (/ثاني|الثانية/i.test(s)) return '2';
    if (/ثالث|الثالثة/i.test(s)) return '3';
    if (/رابع|الرابعة/i.test(s)) return '4';
    // English text
    const lower = s.toLowerCase();
    if (lower.includes('first') || lower.includes('one')) return '1';
    if (lower.includes('second') || lower.includes('two')) return '2';
    if (lower.includes('third') || lower.includes('three')) return '3';
    if (lower.includes('fourth') || lower.includes('four')) return '4';
    return '1';
  };

  const normalizeSection = (sec) => {
    if (!sec) return 'S1';
    const s = sec.toString().trim().toUpperCase().replace(/\s+/g, '');
    const match = s.match(/(\d+)/);
    if (match) {
      return 'S' + parseInt(match[1], 10);
    }
    return 'S1';
  };

  const inferStudentYearFromIdOrLevel = (stuId, rawLevel = '') => {
    if (rawLevel) {
      const norm = normalizeYear(rawLevel);
      if (['1', '2', '3', '4'].includes(norm)) return norm;
    }
    if (!stuId) return '1';
    const strId = String(stuId).trim();
    const digits = strId.replace(/\D/g, '');
    if (digits.length >= 6) {
      const prefix = digits.slice(0, 2);
      if (prefix === '26') return '1';
      if (prefix === '25') return '2';
      if (prefix === '24') return '3';
      if (prefix === '23' || prefix === '22' || prefix === '21' || prefix === '20') return '4';
    }
    return '1';
  };

  const handleAutoFixAllStudentYears = async () => {
    try {
      setImporting(true);
      setMessage('⏳ جاري فحص ومطابقة فرق جميع الطلاب بناءً على السجلات والأرقام الأكاديمية...');
      
      const { data: currentDbStudents, error } = await supabase
        .from('users')
        .select('id, user_id, name, year_level, role')
        .eq('role', 'student');

      if (error) throw error;
      if (!currentDbStudents || currentDbStudents.length === 0) {
        setMessage('لا توجد حسابات طلاب لفحصها');
        setImporting(false);
        return;
      }

      const updatesToRun = [];
      currentDbStudents.forEach(stu => {
        const correctYear = inferStudentYearFromIdOrLevel(stu.user_id, '');
        const currentYear = normalizeYear(stu.year_level);
        if (currentYear !== correctYear) {
          updatesToRun.push({
            id: stu.id,
            user_id: stu.user_id,
            name: stu.name,
            role: 'student',
            year_level: correctYear
          });
        }
      });

      if (updatesToRun.length === 0) {
        setMessage('✅ تم فحص جميع الطلاب: كافة الفرق الدراسية للطلاب صحيحة ومطابقة 100%!');
        setImporting(false);
        setTimeout(() => setMessage(''), 4000);
        return;
      }

      // Use individual .update() calls to avoid NOT NULL password constraint (upsert would clear it)
      let failedCount = 0;
      for (const m of updatesToRun) {
        const { error: updateErr } = await supabase
          .from('users')
          .update({ year_level: m.year_level })
          .eq('id', m.id);
        if (updateErr) {
          console.error(`Failed to update year for student ${m.user_id}:`, updateErr);
          failedCount++;
        }
      }

      cacheManager.invalidate('admin_users_base');
      await fetchData();
      const fixedCount = updatesToRun.length - failedCount;
      setMessage(`🎉 تم تصحيح وضبط فرق عدد (${fixedCount}) طالب تلقائياً بنجاح!${failedCount > 0 ? ` (فشل تصحيح ${failedCount} طالب)` : ''}`);
      setImporting(false);
      setTimeout(() => setMessage(''), 6000);
    } catch (err) {
      console.error('Auto fix years error:', err);
      setMessage('❌ حدث خطأ أثناء تصحيح فرق الطلاب: ' + (err.message || ''));
      setImporting(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // SECURITY HARDENING: Never select plaintext password field
    const { data: usersData } = await supabase
      .from('users')
      .select('id, user_id, name, role, year_level, section, assigned_subjects, auth_id, created_at')
      .order('created_at', { ascending: false });
    if (usersData) setAllUsers(usersData);

    const { data: subData } = await supabase.from('subjects').select('*');
    if (subData) setAllSubjects(subData);
  };

  // When yearLevel changes in student form, preselect matching subjects
  useEffect(() => {
    if (addingType === 'student' && !editMode) {
      const matching = allSubjects.filter(s => normalizeYear(s.year_level) === yearLevel).map(s => s.id);
      setSelectedEnrollSubjects(matching);
    }
  }, [yearLevel, addingType, allSubjects, editMode]);

  const handleManualAdd = async (e) => {
    e.preventDefault();
    setModalError('');
    const trimId = userId.trim();
    const trimName = name.trim();
    const trimPass = password.trim();
    const trimConfirm = confirmPassword.trim();
    if (!trimId || !trimName) return;

    if (!editMode) {
      if (!trimPass) {
        setModalError('❌ يرجى إدخال كلمة المرور');
        return;
      }
      if (trimPass.length < 6) {
        setModalError('❌ يجب أن تتكون كلمة المرور من 6 أحرف أو أرقام على الأقل');
        return;
      }
      if (trimPass !== trimConfirm) {
        setModalError('❌ تأكيد كلمة المرور غير متطابق');
        return;
      }
    } else if (trimPass) {
      if (trimPass.length < 6) {
        setModalError('❌ يجب أن تتكون كلمة المرور الجديدة من 6 أحرف أو أرقام على الأقل');
        return;
      }
      if (trimPass !== trimConfirm) {
        setModalError('❌ تأكيد كلمة المرور الجديدة غير متطابق');
        return;
      }
    }

    setSubmittingUser(true);
    try {
      const payload = {
        name: trimName,
        role: addingType === 'admin' ? 'admin' : 'student',
        year_level: addingType === 'student' ? yearLevel : null,
        section: addingType === 'student' ? normalizeSection(section) : null,
        assigned_subjects: addingType === 'admin' ? assignedSubjects : null,
      };

      const { data: existing } = await supabase.from('users').select('id, user_id').eq('user_id', trimId).maybeSingle();
      if (existing) {
        if (trimPass) {
          try {
            const { error: rpcErr } = await supabase.rpc('admin_update_user_password', { 
              p_user_id: trimId, 
              p_new_password: trimPass 
            });
            if (rpcErr) {
              console.error('Password update error:', rpcErr);
              setModalError('❌ فشل في تحديث كلمة المرور: ' + rpcErr.message);
              setSubmittingUser(false);
              return;
            }
          } catch (err) {
            console.warn('RPC update password:', err);
          }
        }
        const { error: updateErr } = await supabase.from('users').update(payload).eq('user_id', trimId);
        if (updateErr) {
          console.error('Update user error:', updateErr);
          setModalError('❌ فشل في تعديل بيانات المستخدم: ' + updateErr.message);
          setSubmittingUser(false);
          return;
        }
        setMessage('✅ تم تعديل بيانات المستخدم' + (trimPass ? ' وتحديث كلمة المرور المشفرة' : '') + ' بنجاح');
      } else {
        const { error: insertErr } = await supabase.from('users').insert({ 
          user_id: trimId, 
          password: trimPass, 
          ...payload 
        });
        if (insertErr) {
          console.error('Insert user error:', insertErr);
          setModalError('❌ فشل في إضافة المستخدم: ' + insertErr.message);
          setSubmittingUser(false);
          return;
        }
        if (trimPass) {
          try {
            await supabase.rpc('admin_update_user_password', { 
              p_user_id: trimId, 
              p_new_password: trimPass 
            });
          } catch (err) {
            console.warn('RPC set password error:', err);
          }
        }
        setMessage('✅ تمت إضافة المستخدم (' + trimName + ') بنجاح' + (trimPass ? ' وتشفير كلمة المرور' : ''));
      }

      // Parallel sync student enrollment in selected subjects
      if (addingType === 'student' && allSubjects.length > 0) {
        const updates = [];
        for (const sub of allSubjects) {
          const currentEnrolled = Array.isArray(sub.enrolled_students) ? sub.enrolled_students : [];
          const isSelected = selectedEnrollSubjects.includes(sub.id);

          if (isSelected && !currentEnrolled.includes(trimId)) {
            const updated = [...currentEnrolled, trimId];
            updates.push(supabase.from('subjects').update({ enrolled_students: updated, included_students: updated }).eq('id', sub.id));
          } else if (!isSelected && currentEnrolled.includes(trimId)) {
            const updated = currentEnrolled.filter(id => id !== trimId);
            updates.push(supabase.from('subjects').update({ enrolled_students: updated, included_students: updated }).eq('id', sub.id));
          }
        }
        if (updates.length > 0) {
          await Promise.all(updates);
        }
      }

      setUserId(''); setName(''); setPassword(''); setConfirmPassword(''); setEditMode(false); setAssignedSubjects([]); setSelectedEnrollSubjects([]); setSection('S1');
      setShowAddModal(false);
      cacheManager.invalidate('admin_users_base');
      await fetchData();
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      console.error('Unexpected error:', err);
      setModalError('❌ حدث خطأ غير متوقع: ' + (err?.message || err));
    } finally {
      setSubmittingUser(false);
    }
  };

  const handleEdit = (userObj) => {
    setUserId(userObj.user_id);
    setName(userObj.name);
    setPassword('');
    setConfirmPassword('');
    setAddingType(userObj.role === 'admin' ? 'admin' : 'student');
    setYearLevel(normalizeYear(userObj.year_level));
    setSection(normalizeSection(userObj.section || 'S1'));
    setAssignedSubjects(Array.isArray(userObj.assigned_subjects) ? userObj.assigned_subjects : []);

    if (userObj.role === 'student') {
      const enrolledSubs = allSubjects.filter(sub => {
        const enrolled = Array.isArray(sub.enrolled_students) ? sub.enrolled_students : [];
        return enrolled.includes(userObj.user_id);
      }).map(s => s.id);
      setSelectedEnrollSubjects(enrolledSubs);
    }

    setEditMode(true);
    setShowAddModal(true);
  };

  const handleDelete = async (targetUserId, targetName) => {
    if (targetUserId === 'admin') {
      alert('لا يمكن حذف حساب المدير العام الرئيسي!');
      return;
    }

    if (!window.confirm('هل أنت متأكد من حذف (' + targetName + ') نهائياً من النظام؟')) {
      return;
    }

    const { error } = await supabase.from('users').delete().eq('user_id', targetUserId);
    if (!error) {
      for (const sub of allSubjects) {
        if (Array.isArray(sub.enrolled_students) && sub.enrolled_students.includes(targetUserId)) {
          const updated = sub.enrolled_students.filter(id => id !== targetUserId);
          await supabase.from('subjects').update({ enrolled_students: updated, included_students: updated }).eq('id', sub.id);
        }
      }

      setMessage('✅ تم حذف المستخدم بنجاح');
      cacheManager.invalidate('admin_users_base');
    cacheManager.invalidate('admin_subjects_base');
    fetchData();
    setTimeout(() => setMessage(''), 4000);
    } else {
      setMessage('❌ فشل في حذف المستخدم');
    }
  };

  const handleBulkDeleteStudents = async () => {
    if (selectedStudentIds.length === 0) return;

    const count = selectedStudentIds.length;
    if (!window.confirm('هل أنت متأكد من حذف ' + count + ' طالب محدد دفعة واحدة؟ لا يمكن التراجع عن هذه العملية.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .in('user_id', selectedStudentIds);

      if (error) throw error;

      for (const sub of allSubjects) {
        if (Array.isArray(sub.enrolled_students)) {
          const updated = sub.enrolled_students.filter(id => !selectedStudentIds.includes(id));
          if (updated.length !== sub.enrolled_students.length) {
            await supabase.from('subjects').update({ enrolled_students: updated, included_students: updated }).eq('id', sub.id);
          }
        }
      }

      setMessage('✅ تم حذف ' + count + ' طالب بنجاح!');
      setSelectedStudentIds([]);
      fetchData();
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      console.error(err);
      setMessage('❌ حدث خطأ أثناء الحذف الجماعي');
    }
  };

      const downloadSampleExcel = () => {
    const sampleData = [
      {
        'Subject': 'Introduction to Operation Research and Decision Support systems',
        'ID': '2200304',
        'Name': 'roshdy ahmed roshdy',
        'Section': '2',
        'Group': 'A',
        'CourseLevel': '2',
        'StudentLevel': '2',
        'Password': '123456'
      },
      {
        'Subject': 'Microcontrollers',
        'ID': '2200304',
        'Name': 'roshdy ahmed roshdy',
        'Section': '1',
        'CourseLevel': '3',
        'StudentLevel': '2',
        'Password': '123456'
      },
      {
        'Subject': 'Advanced Software Engineering',
        'ID': '2200304',
        'Name': 'roshdy ahmed roshdy',
        'Section': '1',
        'CourseLevel': '3',
        'StudentLevel': '2',
        'Password': '123456'
      },
      {
        'Subject': 'Logic Design',
        'ID': '2200304',
        'Name': 'roshdy ahmed roshdy',
        'Section': '3',
        'CourseLevel': '1',
        'StudentLevel': '2',
        'Password': '123456'
      }
    ];
    exportExcelFile(sampleData, 'نموذج_استيراد_الطلاب_Gradely.xlsx');
  };

  const handleExcelImport = async (e) => {
    e.preventDefault();
    if (!file) return;

    setImporting(true);
    setMessage('');

    try {
      const rows = await parseExcelFile(file);
      if (!rows || rows.length === 0) {
        setMessage('❌ الملف فارغ أو لا يحتوي على صفوف بيانات');
        setImporting(false);
        return;
      }

      // Helper: case-insensitive column getter
      const getVal = (row, ...keys) => {
        for (const k of keys) {
          for (const rk of Object.keys(row)) {
            if (rk.toLowerCase().trim() === k.toLowerCase().trim()) return row[rk];
          }
        }
        return undefined;
      };

      // 1. Single query to fetch existing users and subjects
      const [existingUsersRes, existingSubsRes] = await Promise.all([
        supabase.from('users').select('id, user_id, name, year_level, section, assigned_subjects, auth_id'),
        supabase.from('subjects').select('id, name')
      ]);

      const existingUsersList = existingUsersRes.data || [];
      const existingSubsList = existingSubsRes.data || [];
      const userMap = {};
      existingUsersList.forEach(u => { userMap[u.user_id] = u; });

      const subNameToId = {};
      existingSubsList.forEach(s => { subNameToId[s.name.toLowerCase().trim()] = s.id; });

      const studentMap = {};

      for (const row of rows) {
        const id = (getVal(row, 'ID', 'الرقم الأكاديمي', 'الكود', 'رقم الجلوس', 'كود الطالب'))?.toString().trim();
        const n = (getVal(row, 'Name', 'الاسم', 'اسم الطالب', 'طالب'))?.toString().trim();
        if (!id || !n) continue;

        const stuLevelRaw = getVal(row, 'StudentLevel', 'Student_Level', 'Student Level', 'StudentYear', 'Student_Year', 'فرقة الطالب', 'مستوى الطالب', 'Year', 'YEAR', 'الفرقة', 'السنة', 'Level', 'المستوى');
        const courseLevelRaw = getVal(row, 'CourseLevel', 'Course_Level', 'Course Level', 'CourseYear', 'Course_Year', 'فرقة المادة', 'فرقة المقرر', 'مستوى المادة', 'مستوى المقرر', 'Year', 'YEAR', 'الفرقة', 'السنة', 'Level', 'المستوى');
        
        const studentYear = normalizeYear(stuLevelRaw || '1');
        const sRaw = getVal(row, 'Section', 'السكشن', 'سكشن', 'Sec');
        const s = normalizeSection(sRaw || 'S1');
        const groupRaw = getVal(row, 'Group', 'group', 'الجروب', 'المجموعة', 'مجموعة', 'مجموعة المحاضرة');
        let cleanGroup = '';
        if (groupRaw) {
          cleanGroup = groupRaw.toString().toUpperCase().replace('GROUP', '').replace('مجموعة', '').replace('جروب', '').trim();
        }
        const pass = (getVal(row, 'Password', 'كلمة السر', 'الباسورد') || id)?.toString().trim();
        const subjectName = (getVal(row, 'Subject', 'المادة', 'اسم المادة', 'المقرر'))?.toString().trim();

        if (!studentMap[id]) {
          studentMap[id] = {
            user_id: id,
            name: n,
            year_level: studentYear,
            section: s,
            group: cleanGroup,
            password: pass,
            subSections: {}
          };
        } else {
          studentMap[id].name = n;
          if (cleanGroup) studentMap[id].group = cleanGroup;
          if (stuLevelRaw) studentMap[id].year_level = studentYear;
        }

        if (subjectName) {
          studentMap[id].subSections[subjectName] = s;
        }
      }

      // 2. Prepare array for batch upsert
      const studentsToUpsert = [];

      for (const [id, sData] of Object.entries(studentMap)) {
        const existingUser = userMap[id];
        const currentAssigned = Array.isArray(existingUser?.assigned_subjects) ? existingUser.assigned_subjects : [];
        
        const newEntries = [];
        for (const [sName, sec] of Object.entries(sData.subSections)) {
          const subId = subNameToId[sName.toLowerCase().trim()];
          if (subId) newEntries.push(subId + ':' + sec);
        }

        const subIdsInNew = new Set(newEntries.map(e => e.split(':')[0]));
        const keptOld = currentAssigned.filter(e => typeof e === 'string' && !subIdsInNew.has(e.split(':')[0]) && !e.startsWith('GROUP:'));
        const groupEntry = sData.group ? ['GROUP:' + sData.group] : [];
        const mergedAssigned = [...keptOld, ...groupEntry, ...newEntries];

        studentsToUpsert.push({
          user_id: id,
          name: sData.name,
          role: 'student',
          year_level: sData.year_level,
          section: sData.section,
          assigned_subjects: mergedAssigned,
          auth_id: existingUser ? existingUser.auth_id : null
        });
      }

      // 3. Ultra-fast Chunked Upsert
      const CHUNK_SIZE = 100;
      for (let i = 0; i < studentsToUpsert.length; i += CHUNK_SIZE) {
        const chunk = studentsToUpsert.slice(i, i + CHUNK_SIZE);
        const { error: upsertErr } = await supabase.from('users').upsert(chunk, { onConflict: 'user_id' });
        if (upsertErr) console.error('Batch upsert error:', upsertErr);
      }

      cacheManager.invalidate('admin_users_base');
      fetchData();
      setMessage('✅ تم استيراد وتحديث بيانات ' + studentsToUpsert.length + ' طالب بنجاح فائق!');
      setShowExcelImport(false);
    } catch (err) {
      console.error(err);
      setMessage('❌ حدث خطأ أثناء قراءة ملف الإكسيل، يرجى التأكد من التنسيق');
    } finally {
      setImporting(false);
      setFile(null);
      setTimeout(() => setMessage(''), 6000);
    }
  };

  const toggleAssignedSubject = (subId, sec) => {
    const key = subId + ':' + sec;
    setAssignedSubjects(prev => {
      const exists = prev.includes(key);
      if (exists) {
        return prev.filter(item => item !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const toggleEnrollSubject = (subId) => {
    setSelectedEnrollSubjects(prev => {
      if (prev.includes(subId)) return prev.filter(id => id !== subId);
      else return [...prev, subId];
    });
  };

  const filteredStudents = allUsers
    .filter(u => u.role === 'student')
    .filter(u => {
      const matchSearch = u.name?.toLowerCase().includes(studentSearch.toLowerCase()) || 
                          u.user_id?.toLowerCase().includes(studentSearch.toLowerCase());
      const matchYear = studentYearFilter === 'all' || normalizeYear(u.year_level) === studentYearFilter;
      const matchSection = studentSectionFilter === 'all' || normalizeSection(u.section || 'S1') === normalizeSection(studentSectionFilter);
      return matchSearch && matchYear && matchSection;
    });

  const allStudentsList = allUsers.filter(u => u.role === 'student');
  const adminsList = allUsers.filter(u => u.role === 'admin');

  const toggleSelectAllFiltered = () => {
    if (selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredStudents.map(s => s.user_id));
    }
  };

  const generateRandomPassword = (format) => {
    if (format === 'numeric6') {
      return String(Math.floor(100000 + Math.random() * 900000));
    }
    if (format === 'alphanumeric8') {
      // 8-char mixed: uppercase + lowercase + digits + symbol — much harder to guess
      const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
      const lower = 'abcdefghjkmnpqrstuvwxyz';
      const digits = '23456789';
      const symbols = '!@#$&*';
      const allChars = upper + lower + digits + symbols;
      // Guarantee at least 1 from each category
      let result = [
        upper.charAt(Math.floor(Math.random() * upper.length)),
        lower.charAt(Math.floor(Math.random() * lower.length)),
        digits.charAt(Math.floor(Math.random() * digits.length)),
        symbols.charAt(Math.floor(Math.random() * symbols.length)),
      ];
      for (let i = result.length; i < 8; i++) {
        result.push(allChars.charAt(Math.floor(Math.random() * allChars.length)));
      }
      // Shuffle to avoid predictable pattern
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result.join('');
    }
    // alphanumeric6 (default)
    const chars = '23456789abcdefghjkmnpqrstuvwxyz';
    let res = '';
    for (let i = 0; i < 6; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };


  const handleGenerateAndSyncCredentials = async () => {
    try {
      setIsGeneratingCreds(true);
      setCredsMessage('');

      // 1. Determine target students
      let targets = [];
      if (credentialsScope === 'selected' && selectedStudentIds.length > 0) {
        targets = allUsers.filter(u => u.role === 'student' && selectedStudentIds.includes(u.user_id));
      } else if (credentialsScope === 'filtered') {
        targets = filteredStudents;
      } else if (credentialsScope.startsWith('year_')) {
        const y = credentialsScope.replace('year_', '');
        targets = allUsers.filter(u => u.role === 'student' && normalizeYear(u.year_level) === y);
      } else {
        // all
        targets = allUsers.filter(u => u.role === 'student');
      }

      if (targets.length === 0) {
        setCredsMessage('❌ لا يوجد طلاب مطابقون للنطاق المختار');
        setIsGeneratingCreds(false);
        return;
      }

      // Sort targets by year, section, name
      targets.sort((a, b) => {
        const yA = parseInt(normalizeYear(a.year_level), 10) || 1;
        const yB = parseInt(normalizeYear(b.year_level), 10) || 1;
        if (yA !== yB) return yA - yB;
        const sA = (a.section || 'S1').localeCompare(b.section || 'S1');
        if (sA !== 0) return sA;
        return (a.name || '').localeCompare(b.name || '', 'ar');
      });

      // 2. Generate passwords
      const credsList = targets.map(stu => ({
        user_id: stu.user_id,
        name: stu.name,
        year_level: normalizeYear(stu.year_level),
        section: normalizeSection(stu.section || 'S1'),
        password: generateRandomPassword(passwordFormat)
      }));

      setSyncCredsProgress({ current: 0, total: credsList.length });

      // 3. Batch sync passwords into database (via RPC or users table)
      const BATCH_SIZE = 25;
      for (let i = 0; i < credsList.length; i += BATCH_SIZE) {
        const chunk = credsList.slice(i, i + BATCH_SIZE);
        await Promise.all(chunk.map(async (c) => {
          try {
            await supabase.rpc('admin_update_user_password', {
              p_user_id: c.user_id,
              p_new_password: c.password
            });
          } catch (e) {
            await supabase.from('users').update({ password: c.password }).eq('user_id', c.user_id);
          }
        }));
        setSyncCredsProgress({ current: Math.min(i + BATCH_SIZE, credsList.length), total: credsList.length });
      }

      setGeneratedCredentials(credsList);
      setCredsMessage(`🎉 تم بنجاح توليد وتشفير كلمات المرور لـ ${credsList.length} طالب! جاهز للطباعة والتصدير.`);
    } catch (err) {
      console.error('Credentials generation error:', err);
      setCredsMessage('❌ حدث خطأ أثناء الحفظ: ' + err.message);
    } finally {
      setIsGeneratingCreds(false);
    }
  };

  const handleExportCredentialsExcel = () => {
    if (generatedCredentials.length === 0) return;
    const rows = generatedCredentials.map((c, idx) => ({
      'م': idx + 1,
      'الاسم': c.name,
      'الرقم الأكاديمي': c.user_id,
      'كلمة المرور المؤقتة': c.password,
      'الفرقة': 'الفرقة ' + c.year_level,
      'السكشن': c.section
    }));
    const timestamp = new Date().toISOString().slice(0, 10);
    exportExcelFile(rows, `Gradely_Student_Credentials_${timestamp}.xlsx`);
  };

  const handlePrintCredentialsCards = () => {
    if (generatedCredentials.length === 0) return;
    printStudentCredentialsSlips({
      credentialsList: generatedCredentials,
      title: 'كروت كلمات المرور الابتدائية للطلاب - Gradely'
    });
  };

  return (
    <div className="fade-in">
      
      {/* Top Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'1rem'}}>
        <div>
          <h2 style={{margin:0,fontSize:'1.6rem',fontWeight:800}}>إدارة المستخدمين والحسابات</h2>
          <p className="text-muted" style={{margin:'5px 0 0 0'}}>
            إدارة حسابات الطلاب والمعيدين وصلاحيات المواد والسكاشن المشفرة
          </p>
        </div>

        <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
          {selectedStudentIds.length > 0 && activeSubTab === 'students' && (
            <button 
              className="btn-secondary" 
              onClick={handleBulkDeleteStudents}
              style={{color:'var(--danger)',borderColor:'rgba(239, 68, 68, 0.4)',background:'rgba(239, 68, 68, 0.1)'}}
            >
              <Trash2 size={18} /> حذف المحدد ({selectedStudentIds.length})
            </button>
          )}

          {isSuper && activeSubTab === 'students' && (
            <button 
              className="btn-secondary" 
              onClick={handleAutoFixAllStudentYears}
              style={{color:'#38bdf8',borderColor:'rgba(56, 189, 248, 0.4)',background:'rgba(56, 189, 248, 0.08)',display:'flex',alignItems:'center',gap:'6px',fontWeight:700}}
              title="فحص ومطابقة وتصحيح فرق جميع الطلاب تلقائياً بناءً على الأرقام الأكاديمية والبيانات الرسمية"
            >
              <RefreshCw size={16} /> ⚡ تدقيق وتصحيح فرق الطلاب تلقائياً
            </button>
          )}

          {isSuper && activeSubTab === 'students' && (
            <button 
              className="btn-secondary" 
              onClick={() => {
                setShowCredentialsModal(true);
                setCredsMessage('');
                setGeneratedCredentials([]);
              }}
              style={{color:'var(--primary-hover)',borderColor:'rgba(79, 70, 229, 0.4)',background:'rgba(79, 70, 229, 0.1)',display:'flex',alignItems:'center',gap:'6px',fontWeight:700}}
              title="توليد وتصدير كلمات مرور عشوائية للطلاب في كشف منظم أو كروت مقصوصة للطباعة"
            >
              <KeyRound size={18} /> 🔑 توليد وتصدير كروت وكلمات مرور الطلاب
            </button>
          )}

          <button 
            className="btn-secondary" 
            onClick={() => { setFile(null); setShowExcelImport(true); }}
            style={{color:'var(--success)'}}
          >
            <Upload size={18} /> استيراد شيت إكسيل
          </button>
          <button 
            className="btn-primary" 
            onClick={() => {
              setUserId(''); setName(''); setPassword(''); setConfirmPassword(''); setEditMode(false); setAssignedSubjects([]); setSelectedEnrollSubjects([]); setSection('S1');
              setYearLevel('1');
              setAddingType(activeSubTab === 'admins' ? 'admin' : 'student');
              setShowAddModal(true);
            }}
          >
            <UserPlus size={18} /> إضافة مستخدم يدوي
          </button>
        </div>
      </div>

      {/* Feedback Message */}
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

      {/* Tabs Navigation */}
      <div style={{display:'flex',gap:'10px',marginBottom:'1.5rem',borderBottom:'1px solid var(--border)',paddingBottom:'10px'}}>
        <button 
          onClick={() => { setActiveSubTab('students'); setSelectedStudentIds([]); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeSubTab === 'students' ? 'var(--primary-hover)' : 'var(--text-muted)',
            borderBottom: activeSubTab === 'students' ? '3px solid var(--primary-hover)' : '3px solid transparent',
            padding: '8px 16px',
            fontSize: '1.1rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <GraduationCap size={20} /> سجل الطلاب ({allUsers.filter(u => u.role === 'student').length})
        </button>

        <button 
          onClick={() => { setActiveSubTab('admins'); setSelectedStudentIds([]); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeSubTab === 'admins' ? 'var(--primary-hover)' : 'var(--text-muted)',
            borderBottom: activeSubTab === 'admins' ? '3px solid var(--primary-hover)' : '3px solid transparent',
            padding: '8px 16px',
            fontSize: '1.1rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <Shield size={20} /> المعيدين والمشرفين ({adminsList.length})
        </button>
      </div>

      {/* 1. STUDENTS SUB-TAB */}
      {activeSubTab === 'students' && (
        <div>
          {/* Filters Bar */}
          <div className="panel" style={{display:'flex',gap:'1rem',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap'}}>
            <div style={{flex: 1.5, minWidth: '220px', position: 'relative'}}>
              <Search size={18} style={{position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)'}} />
              <input 
                type="text" 
                className="input-field" 
                placeholder="بحث بالرقم الأكاديمي أو اسم الطالب..." 
                value={studentSearch} 
                onChange={e=>setStudentSearch(e.target.value)}
                style={{paddingRight: '38px'}}
              />
            </div>
            <div style={{flex: 1, minWidth: '160px'}}>
              <select className="input-field" value={studentYearFilter} onChange={e=>setStudentYearFilter(e.target.value)}>
                <option value="all">جميع الفرق الدراسية</option>
                <option value="1">الفرقة الأولى (1)</option>
                <option value="2">الفرقة الثانية (2)</option>
                <option value="3">الفرقة الثالثة (3)</option>
                <option value="4">الفرقة الرابعة (4)</option>
              </select>
            </div>
            <div style={{flex: 1, minWidth: '140px'}}>
              <select className="input-field" value={studentSectionFilter} onChange={e=>setStudentSectionFilter(e.target.value)}>
                <option value="all">جميع السكاشن</option>
                <option value="S1">سكشن S1</option>
                <option value="S2">سكشن S2</option>
                <option value="S3">سكشن S3</option>
                <option value="S4">سكشن S4</option>
                <option value="S5">سكشن S5</option>
                <option value="S6">سكشن S6</option>
              </select>
            </div>
          </div>

          {/* Students Table with Selection */}
          <div className="panel" style={{padding:0, overflowX:'auto'}}>
            <table className="table" style={{width:'100%', borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'rgba(255,255,255,0.02)',borderBottom:'1px solid var(--border)',textAlign:'right'}}>
                  <th style={{padding:'14px 16px',width:'45px',textAlign:'center'}}>
                    <input 
                      type="checkbox" 
                      checked={selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0} 
                      onChange={toggleSelectAllFiltered}
                      title="تحديد الكل"
                    />
                  </th>
                  <th style={{padding:'14px 16px'}}>الرقم الأكاديمي (ID)</th>
                  <th style={{padding:'14px 16px'}}>اسم الطالب</th>
                  <th style={{padding:'14px 16px'}}>الفرقة</th>
                  <th style={{padding:'14px 16px'}}>السكشن</th>
                  <th style={{padding:'14px 16px'}}>الحالة الأمنية</th>
                  <th style={{padding:'14px 16px',textAlign:'center'}}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map(stu => {
                  const isSelected = selectedStudentIds.includes(stu.user_id);
                  return (
                    <tr key={stu.id} style={{borderBottom:'1px solid var(--border)',background: isSelected ? 'rgba(79, 70, 229, 0.08)' : 'transparent'}}>
                      <td style={{padding:'14px 16px',textAlign:'center'}}>
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedStudentIds([...selectedStudentIds, stu.user_id]);
                            else setSelectedStudentIds(selectedStudentIds.filter(id => id !== stu.user_id));
                          }}
                        />
                      </td>
                      <td style={{padding:'14px 16px',fontWeight:'bold'}}>{stu.user_id}</td>
                      <td style={{padding:'14px 16px'}}>{stu.name}</td>
                      <td style={{padding:'14px 16px'}}>
                        <span className="badge" style={{background:'rgba(79, 70, 229, 0.1)',color:'var(--primary-hover)',border:'1px solid rgba(79, 70, 229, 0.2)'}}>
                          الفرقة {normalizeYear(stu.year_level)}
                        </span>
                      </td>
                      <td style={{padding:'14px 16px'}}>
                        <span className="badge" style={{background:'rgba(16, 185, 129, 0.1)',color:'var(--success)',border:'1px solid rgba(16, 185, 129, 0.2)'}}>
                          {stu.section || 'S1'}
                        </span>
                      </td>
                      <td style={{padding:'14px 16px'}}>
                        <span className="badge" style={{background:'rgba(16, 185, 129, 0.1)',color:'var(--success)',border:'1px solid rgba(16, 185, 129, 0.2)',display:'inline-flex',alignItems:'center',gap:'4px'}}>
                          <Shield size={13} /> محمي ومشفر
                        </span>
                      </td>
                      <td style={{padding:'14px 16px',textAlign:'center'}}>
                        <div style={{display:'inline-flex',gap:'8px'}}>
                          <button onClick={() => handleEdit(stu)} className="btn-secondary" style={{padding:'6px 10px'}} title="تعديل بيانات الطالب وتعيين كلمة مرور جديدة">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => handleDelete(stu.user_id, stu.name)} className="btn-secondary" style={{padding:'6px 10px',color:'var(--danger)'}} title="حذف الطالب">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{textAlign:'center',padding:'3rem',color:'var(--text-muted)'}}>
                      لا توجد بيانات طلاب مطابقة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. ADMINS SUB-TAB */}
      {activeSubTab === 'admins' && (
        <div className="panel" style={{padding:0, overflowX:'auto'}}>
          <table className="table" style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'rgba(255,255,255,0.02)',borderBottom:'1px solid var(--border)',textAlign:'right'}}>
                <th style={{padding:'14px 16px'}}>اسم المستخدم</th>
                <th style={{padding:'14px 16px'}}>الاسم</th>
                <th style={{padding:'14px 16px'}}>الصلاحية / الدور</th>
                <th style={{padding:'14px 16px'}}>الحالة الأمنية</th>
                <th style={{padding:'14px 16px'}}>المواد المصرّح بها (للمعيدين)</th>
                <th style={{padding:'14px 16px',textAlign:'center'}}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {adminsList.map(adm => {
                const isSuper = isSuperUser(adm);
                return (
                  <tr key={adm.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'14px 16px',fontWeight:'bold'}}>{adm.user_id}</td>
                    <td style={{padding:'14px 16px'}}>{adm.name}</td>
                    <td style={{padding:'14px 16px'}}>
                      <span className="badge" style={{background: isSuper ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: isSuper ? 'var(--danger)' : 'var(--success)', border: isSuper ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)'}}>
                        {isSuper ? 'مدير عام (Super Admin)' : 'معيد / مشرف مادة (TA)'}
                      </span>
                    </td>
                    <td style={{padding:'14px 16px'}}>
                      <span className="badge" style={{background:'rgba(16, 185, 129, 0.1)',color:'var(--success)',border:'1px solid rgba(16, 185, 129, 0.2)',display:'inline-flex',alignItems:'center',gap:'4px'}}>
                        <Shield size={13} /> محمي ومشفر
                      </span>
                    </td>
                    <td style={{padding:'14px 16px'}}>
                      {isSuper ? (
                        <span style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>كامل الصلاحيات (جميع المواد)</span>
                      ) : (
                        <div style={{display:'flex',gap:'5px',flexWrap:'wrap'}}>
                          {(() => {
                            const subjectEntries = [];
                            const seenSubIds = new Set();
                            if (Array.isArray(adm.assigned_subjects)) {
                              adm.assigned_subjects.forEach(subEntry => {
                                if (typeof subEntry !== 'string' || subEntry.startsWith('CONFIG') || subEntry.startsWith('VISIBILITY')) return;
                                const subId = subEntry.split(':')[0];
                                const sec = subEntry.includes(':') ? subEntry.split(':')[1] : null;
                                const s = allSubjects.find(x => x.id === subId);
                                if (s) {
                                  seenSubIds.add(subId);
                                  subjectEntries.push({ name: s.name, sec, key: subEntry });
                                }
                              });
                            }
                            allSubjects.forEach(s => {
                              if (!seenSubIds.has(s.id) && (s.instructor_id === adm.user_id || s.instructor_name === adm.name)) {
                                seenSubIds.add(s.id);
                                subjectEntries.push({ name: s.name, sec: null, key: 'instr-' + s.id });
                              }
                            });
                            if (subjectEntries.length === 0) {
                              return <span style={{color:'var(--danger)',fontSize:'0.85rem'}}>لم تُعيّن مواد بعد</span>;
                            }
                            return subjectEntries.map(entry => (
                              <span key={entry.key} className="badge" style={{background:'var(--bg)',border:'1px solid var(--border)'}}>
                                {entry.name} {entry.sec ? '(' + entry.sec + ')' : ''}
                              </span>
                            ));
                          })()}
                        </div>
                      )}
                    </td>
                    <td style={{padding:'14px 16px',textAlign:'center'}}>
                      <div style={{display:'inline-flex',gap:'8px'}}>
                        <button onClick={() => handleEdit(adm)} className="btn-secondary" style={{padding:'6px 10px'}} title="تعديل الحساب وتعيين كلمة مرور جديدة">
                          <Edit size={16} />
                        </button>
                        {!isSuper && (
                          <button onClick={() => handleDelete(adm.user_id, adm.name)} className="btn-secondary" style={{padding:'6px 10px',color:'var(--danger)'}} title="حذف الحساب">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. ADD / EDIT USER MODAL */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1rem', boxSizing: 'border-box'
        }}>
          <div className="panel fade-in" style={{maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.85)', borderRadius: '16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',borderBottom:'1px solid var(--border)',paddingBottom:'1rem'}}>
              <h3 style={{margin:0,fontSize:'1.3rem'}}>
                {editMode ? 'تعديل بيانات المستخدم وإعادة تعيين كلمة المرور' : (addingType === 'admin' ? 'إضافة معيد / مشرف جديد' : 'إضافة طالب جديد')}
              </h3>
              <button onClick={() => setShowAddModal(false)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleManualAdd} style={{display:'flex',flexDirection:'column',gap:'1.2rem'}}>
              
              {!editMode && (
                <div>
                  <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>نوع الحساب:</label>
                  <div style={{display:'flex',gap:'1rem'}}>
                    <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer'}}>
                      <input 
                        type="radio" 
                        name="addingType" 
                        value="student" 
                        checked={addingType === 'student'} 
                        onChange={() => setAddingType('student')}
                      />
                      طالب (Student)
                    </label>
                    <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer'}}>
                      <input 
                        type="radio" 
                        name="addingType" 
                        value="admin" 
                        checked={addingType === 'admin'} 
                        onChange={() => setAddingType('admin')}
                      />
                      معيد / مشرف (TA / Instructor)
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>
                  {addingType === 'admin' ? 'اسم المستخدم / الكود (Username):' : 'الرقم الأكاديمي (ID):'}
                </label>
                <input 
                  className="input-field" 
                  type="text" 
                  value={userId} 
                  onChange={e=>setUserId(e.target.value)} 
                  required 
                  disabled={editMode}
                  placeholder={addingType === 'admin' ? 'مثال: ta_ahmed أو 2024100' : 'مثال: 2500850'} 
                />
              </div>

              <div>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>الاسم الكامل:</label>
                <input 
                  className="input-field" 
                  type="text" 
                  value={name} 
                  onChange={e=>setName(e.target.value)} 
                  required 
                  placeholder="أدخل الاسم ثلاثي أو رباعي" 
                />
              </div>

              <div style={{display:'grid',gridTemplateColumns: editMode ? '1fr 1fr' : '1fr 1fr',gap:'1rem'}}>
                <div>
                  <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>
                    {editMode ? 'كلمة المرور الجديدة (اختياري):' : 'كلمة المرور (6 خانات على الأقل):'}
                  </label>
                  <input 
                    className="input-field" 
                    type="password" 
                    value={password} 
                    onChange={e=>setPassword(e.target.value)} 
                    required={!editMode}
                    minLength={6}
                    placeholder={editMode ? 'اتركها فارغة لعدم التغيير' : 'أدخل 6 خانات أو أكثر'} 
                  />
                </div>

                <div>
                  <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>
                    تأكيد كلمة المرور:
                  </label>
                  <input 
                    className="input-field" 
                    type="password" 
                    value={confirmPassword} 
                    onChange={e=>setConfirmPassword(e.target.value)} 
                    required={!editMode || password.length > 0}
                    minLength={password.length > 0 ? 6 : 0}
                    placeholder="أعد إدخال كلمة المرور" 
                  />
                </div>
              </div>

              {/* Student Fields */}
              {addingType === 'student' && (
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>
                    <div>
                      <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>الفرقة الدراسية:</label>
                      <select className="input-field" value={yearLevel} onChange={e=>setYearLevel(e.target.value)}>
                        <option value="1">الفرقة الأولى (1)</option>
                        <option value="2">الفرقة الثانية (2)</option>
                        <option value="3">الفرقة الثالثة (3)</option>
                        <option value="4">الفرقة الرابعة (4)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>السكشن الافتراضي:</label>
                      <select className="input-field" value={section} onChange={e=>setSection(e.target.value)}>
                        <option value="S1">سكشن S1</option>
                        <option value="S2">سكشن S2</option>
                        <option value="S3">سكشن S3</option>
                        <option value="S4">سكشن S4</option>
                        <option value="S5">سكشن S5</option>
                        <option value="S6">سكشن S6</option>
                      </select>
                    </div>
                  </div>

                  {/* Subject Enrollment Checklist */}
                  <div style={{marginTop:'0.5rem'}}>
                    <label style={{display:'block',marginBottom:'8px',fontSize:'0.95rem',fontWeight:700,color:'var(--primary-hover)'}}>
                      📚 تسجيل الطالب في المواد الدراسية:
                    </label>
                    <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'8px',padding:'12px',maxHeight:'160px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'8px'}}>
                      {allSubjects.map(sub => {
                        const isChecked = selectedEnrollSubjects.includes(sub.id);
                        return (
                          <label key={sub.id} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.9rem',cursor:'pointer'}}>
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={() => toggleEnrollSubject(sub.id)}
                            />
                            <span>{sub.name} (فرقة {normalizeYear(sub.year_level)})</span>
                          </label>
                        );
                      })}
                      {allSubjects.length === 0 && (
                        <div style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>لا توجد مواد مضافة في النظام حالياً</div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* TA Fields */}
              {addingType === 'admin' && (
                <div>
                  <label style={{display:'block',marginBottom:'8px',fontSize:'0.95rem',fontWeight:700,color:'var(--primary-hover)'}}>
                    المواد والسكاشن المصرّح للمعيد بالوصول إليها:
                  </label>
                  <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'8px',padding:'12px',maxHeight:'200px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'10px'}}>
                    {allSubjects.map(sub => {
                      const enrolled = Array.isArray(sub.enrolled_students) ? sub.enrolled_students : [];
                      const actualSections = new Set();
                      enrolled.forEach(uid => {
                        const stu = allUsers.find(u => u.user_id === uid && u.role === 'student');
                        if (stu) {
                          let sec = null;
                          if (Array.isArray(stu.assigned_subjects)) {
                            const match = stu.assigned_subjects.find(e => typeof e === 'string' && e.startsWith(sub.id + ':'));
                            if (match) sec = match.split(':')[1];
                          }
                          if (!sec) sec = stu.section || 'S1';
                          actualSections.add(normalizeSection(sec));
                        }
                      });
                      const sectionsList = actualSections.size > 0 ? [...actualSections].sort() : ['S1'];
                      return (
                        <div key={sub.id} style={{borderBottom:'1px solid rgba(255,255,255,0.05)',paddingBottom:'8px'}}>
                          <div style={{fontWeight:700,fontSize:'0.9rem',marginBottom:'4px'}}>{sub.name} (فرقة {normalizeYear(sub.year_level)})</div>
                          <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
                            {sectionsList.map(sec => {
                              const isAssigned = assignedSubjects.includes(sub.id + ':' + sec);
                              return (
                                <label key={sec} style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'0.8rem',cursor:'pointer'}}>
                                  <input 
                                    type="checkbox" 
                                    checked={isAssigned}
                                    onChange={() => toggleAssignedSubject(sub.id, sec)}
                                  />
                                  {sec}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {modalError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid var(--danger)',
                  color: 'var(--danger)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {modalError}
                </div>
              )}

              <div style={{display:'flex',gap:'10px',marginTop:'1rem'}}>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{flex:1}} 
                  disabled={submittingUser}
                >
                  {submittingUser ? '⏳ جاري الحفظ وتشفير الحساب...' : (editMode ? 'حفظ التعديلات' : 'إضافة المستخدم')}
                </button>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setShowAddModal(false)}
                  disabled={submittingUser}
                >
                  إلغاء
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 4. EXCEL IMPORT MODAL */}
      {showExcelImport && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1rem', boxSizing: 'border-box'
        }}>
          <div className="panel fade-in" style={{maxWidth: '500px', width: '100%', border: '1px solid var(--border)', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.85)', borderRadius: '16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',borderBottom:'1px solid var(--border)',paddingBottom:'1rem'}}>
              <h3 style={{margin:0,fontSize:'1.3rem'}}>استيراد بيانات الطلاب من ملف إكسيل</h3>
              <button onClick={() => setShowExcelImport(false)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleExcelImport} style={{display:'flex',flexDirection:'column',gap:'1.2rem'}}>
              <p className="text-muted" style={{fontSize:'0.9rem',margin:0}}>
                يجب أن يحتوي ملف الإكسيل على الأعمدة التالية (أو باللغة العربية):
                <br />
                <strong>ID (الرقم الأكاديمي), Name (الاسم), Year (الفرقة), Section (السكشن), Password (كلمة السر)</strong>
              </p>

              <div style={{border:'2px dashed var(--border)',borderRadius:'8px',padding:'2rem',textAlign:'center'}}>
                <Upload size={36} style={{color:'var(--primary-hover)',marginBottom:'10px'}} />
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  onChange={e => setFile(e.target.files[0])} 
                  required 
                  style={{display:'block',margin:'0 auto'}}
                />
              </div>

              <div style={{display:'flex',gap:'10px'}}>
                <button type="submit" className="btn-primary" disabled={importing || !file} style={{flex:1}}>
                  {importing ? 'جاري الاستيراد والمعالجة...' : 'بدء الاستيراد'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowExcelImport(false)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. CREDENTIALS GENERATION & EXPORT MODAL */}
      {showCredentialsModal && (
        <div 
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 'clamp(1rem, 3vw, 2rem)', boxSizing: 'border-box'
          }}
          onClick={e => { if (e.target === e.currentTarget && !isGeneratingCreds) setShowCredentialsModal(false); }}
        >
          <div className="panel fade-in" style={{maxWidth: '680px', width: '100%', maxHeight: '92vh', overflowY: 'auto', border: '1px solid rgba(79, 70, 229, 0.4)', boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85)', borderRadius: '16px', padding: '1.8rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.2rem',borderBottom:'1px solid var(--border)',paddingBottom:'0.8rem'}}>
              <h3 style={{margin:0,fontSize:'1.3rem',color:'var(--primary-hover)',fontWeight:800,display:'flex',alignItems:'center',gap:'8px'}}>
                <KeyRound size={22} /> توليد وتصدير كروت وكلمات مرور الطلاب
              </h3>
              <button 
                onClick={() => setShowCredentialsModal(false)}
                className="btn-secondary"
                disabled={isGeneratingCreds}
                style={{padding:'4px 10px',fontSize:'0.85rem'}}
              >
                ✕ إغلاق
              </button>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:'1.2rem'}}>
              
              <div style={{background:'rgba(79, 70, 229, 0.08)',padding:'12px 16px',borderRadius:'10px',border:'1px solid rgba(79, 70, 229, 0.25)'}}>
                <p style={{margin:0,fontWeight:700,color:'var(--primary-hover)',fontSize:'0.9rem'}}>
                  🛡️ تأمين حسابات الطلاب وتوزيع كلمات المرور
                </p>
                <p style={{margin:'4px 0 0 0',fontSize:'0.82rem',color:'var(--text-muted)'}}>
                  تتيح لك هذه الأداة توليد كلمات مرور ابتدائية عشوائية وتشفيرها في قاعدة البيانات، ثم طباعة كروت مقصوصة أو تصدير شيت إكسيل مقتضب لتوزيعه على الطلاب. يُلزم الطالب بتغيير كلمة المرور فور دخوله لأول مرة.
                </p>
              </div>

              {/* Scope & Format Options */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',gap:'1rem'}}>
                <div>
                  <label style={{display:'block',marginBottom:'6px',fontSize:'0.88rem',fontWeight:700}}>
                    👥 نطاق الطلاب المستهدفين:
                  </label>
                  <select 
                    className="input-field" 
                    value={credentialsScope} 
                    onChange={e => setCredentialsScope(e.target.value)}
                    disabled={isGeneratingCreds}
                    style={{width:'100%',padding:'9px 12px',fontWeight:700}}
                  >
                    <option value="all">🌐 كافة طلاب الكلية ({allStudentsList.length} طالب)</option>
                    <option value="filtered">🔍 نتائج البحث والفلتر الحالية ({filteredStudents.length} طالب)</option>
                    {selectedStudentIds.length > 0 && (
                      <option value="selected">✅ الطلاب المحددين فقط ({selectedStudentIds.length} طالب)</option>
                    )}
                    <option value="year_1">الفرقة الأولى فقط ({allStudentsList.filter(s => normalizeYear(s.year_level) === '1').length} طالب)</option>
                    <option value="year_2">الفرقة الثانية فقط ({allStudentsList.filter(s => normalizeYear(s.year_level) === '2').length} طالب)</option>
                    <option value="year_3">الفرقة الثالثة فقط ({allStudentsList.filter(s => normalizeYear(s.year_level) === '3').length} طالب)</option>
                    <option value="year_4">الفرقة الرابعة فقط ({allStudentsList.filter(s => normalizeYear(s.year_level) === '4').length} طالب)</option>
                  </select>
                </div>

                <div>
                  <label style={{display:'block',marginBottom:'6px',fontSize:'0.88rem',fontWeight:700}}>
                    🔢 نمط كلمة المرور:
                  </label>
                  <select 
                    className="input-field" 
                    value={passwordFormat} 
                    onChange={e => setPasswordFormat(e.target.value)}
                    disabled={isGeneratingCreds}
                    style={{width:'100%',padding:'9px 12px',fontWeight:700}}
                  >
                    <option value="numeric6">🔢 6 أرقام عشوائية (مثال: 582914) - سهل ومريح للطلاب</option>
                    <option value="alphanumeric6">🔤 6 حروف وأرقام إنجليزية (مثال: k9m2p7)</option>
                    <option value="alphanumeric8">🔐 8 أحرف متنوعة (حروف كبيرة/صغيرة + أرقام + رمز) - أقوى وأصعب تخمين (مثال: Kx3@mN9b)</option>
                  </select>
                </div>
              </div>

              {/* Generate Button */}
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleGenerateAndSyncCredentials}
                  disabled={isGeneratingCreds}
                  style={{padding:'12px',fontSize:'1rem',fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',background:'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)'}}
                >
                  {isGeneratingCreds ? (
                    <>
                      <RefreshCw size={18} className="spin" />
                      جاري توليد وتشفير كلمات المرور ({syncCredsProgress.current} / {syncCredsProgress.total})...
                    </>
                  ) : (
                    <>
                      <KeyRound size={18} />
                      ⚡ توليد وتشفير كلمات المرور في قاعدة البيانات الآن
                    </>
                  )}
                </button>

                {isGeneratingCreds && (
                  <div style={{width:'100%',background:'var(--bg)',height:'8px',borderRadius:'4px',overflow:'hidden',border:'1px solid var(--border)'}}>
                    <div style={{
                      height:'100%',
                      background:'linear-gradient(90deg, #4f46e5, #10b981)',
                      width: `${syncCredsProgress.total > 0 ? (syncCredsProgress.current / syncCredsProgress.total) * 100 : 0}%`,
                      transition: 'width 0.2s ease'
                    }} />
                  </div>
                )}
              </div>

              {credsMessage && (
                <div style={{
                  background: credsMessage.startsWith('🎉') ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.15)',
                  border: credsMessage.startsWith('🎉') ? '1px solid var(--success)' : '1px solid var(--danger)',
                  color: credsMessage.startsWith('🎉') ? 'var(--success)' : 'var(--danger)',
                  padding: '10px 14px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 700
                }}>
                  {credsMessage}
                </div>
              )}

              {/* Export and Print Action Toolbar */}
              {generatedCredentials.length > 0 && (
                <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'12px',padding:'16px',display:'flex',flexDirection:'column',gap:'1rem'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'10px'}}>
                    <span style={{fontWeight:800,fontSize:'0.95rem',color:'var(--text-main)'}}>
                      📋 جاهز للتوزيع ({generatedCredentials.length} طالب):
                    </span>
                    <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handlePrintCredentialsCards}
                        style={{background:'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',borderColor:'#0369a1',display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',fontSize:'0.88rem',fontWeight:700}}
                        title="طباعة بطاقات وكروت مقصوصة جاهزة للتسليم للطلاب في السكشن"
                      >
                        <Printer size={16} /> 📄 طباعة كروت الدخول (A4)
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleExportCredentialsExcel}
                        style={{color:'var(--success)',borderColor:'rgba(16,185,129,0.4)',display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',fontSize:'0.88rem',fontWeight:700}}
                        title="تصدير شيت إكسيل مضغوط يحتوي على الاسم والـ ID وكلمة المرور فقط"
                      >
                        <FileSpreadsheet size={16} /> 📊 تصدير شيت إكسيل (.xlsx)
                      </button>
                    </div>
                  </div>

                  {/* Compact Preview Table */}
                  <div style={{maxHeight:'190px',overflowY:'auto',border:'1px solid var(--border)',borderRadius:'8px'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem',textAlign:'right'}}>
                      <thead>
                        <tr style={{background:'rgba(255,255,255,0.03)',borderBottom:'1px solid var(--border)'}}>
                          <th style={{padding:'6px 10px'}}>الاسم</th>
                          <th style={{padding:'6px 10px'}}>الرقم الأكاديمي (ID)</th>
                          <th style={{padding:'6px 10px'}}>كلمة المرور المؤقتة</th>
                          <th style={{padding:'6px 10px'}}>الفرقة / السكشن</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generatedCredentials.slice(0, 8).map((c, idx) => (
                          <tr key={idx} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                            <td style={{padding:'6px 10px',fontWeight:700}}>{c.name}</td>
                            <td style={{padding:'6px 10px',fontFamily:'monospace',direction:'ltr',textAlign:'right'}}>{c.user_id}</td>
                            <td style={{padding:'6px 10px'}}>
                              <span style={{background:'rgba(79, 70, 229, 0.15)',color:'var(--primary-hover)',padding:'2px 8px',borderRadius:'4px',fontFamily:'monospace',fontWeight:800}}>
                                {c.password}
                              </span>
                            </td>
                            <td style={{padding:'6px 10px',color:'var(--text-muted)'}}>
                              الفرقة {c.year_level} - {c.section}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {generatedCredentials.length > 8 && (
                    <div style={{fontSize:'0.75rem',color:'var(--text-muted)',textAlign:'center'}}>
                      يظهر في المعاينة أول 8 طلاب من إجمالي {generatedCredentials.length} طالب (سيتم تصدير وطباعة الكل بالكامل).
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
