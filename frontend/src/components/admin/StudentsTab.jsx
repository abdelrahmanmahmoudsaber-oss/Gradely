import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { parseExcelFile } from '../../utils/excelHelper';
import { cacheManager } from '../../utils/dataCache';
import { Users, Upload, UserPlus, Edit, Trash2, Search, Shield, GraduationCap, X, ChevronDown, KeyRound, Filter, CheckSquare, Square, BookOpen, Lock } from 'lucide-react';

export default function StudentsTab({ user }) {
  const [allUsers, setAllUsers] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState('students'); // 'students' or 'admins'
  
  // Modals visibility
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [importTargetSubject, setImportTargetSubject] = useState('');

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
    const trimId = userId.trim();
    const trimName = name.trim();
    const trimPass = password.trim();
    const trimConfirm = confirmPassword.trim();
    if (!trimId || !trimName) return;

    if (!editMode) {
      if (!trimPass) {
        setMessage('❌ يرجى إدخال كلمة المرور');
        return;
      }
      if (trimPass.length < 6) {
        setMessage('❌ يجب أن تتكون كلمة المرور من 6 أحرف أو أرقام على الأقل');
        return;
      }
      if (trimPass !== trimConfirm) {
        setMessage('❌ تأكيد كلمة المرور غير متطابق');
        return;
      }
    } else if (trimPass) {
      if (trimPass.length < 6) {
        setMessage('❌ يجب أن تتكون كلمة المرور الجديدة من 6 أحرف أو أرقام على الأقل');
        return;
      }
      if (trimPass !== trimConfirm) {
        setMessage('❌ تأكيد كلمة المرور الجديدة غير متطابق');
        return;
      }
    }

    const payload = {
      name: trimName,
      role: addingType === 'admin' ? 'admin' : 'student',
      year_level: addingType === 'student' ? yearLevel : null,
      section: addingType === 'student' ? normalizeSection(section) : null,
      assigned_subjects: addingType === 'admin' ? assignedSubjects : null,
    };

    const { data: existing } = await supabase.from('users').select('id').eq('user_id', trimId).single();
    if (existing) {
      if (trimPass) {
        try {
          const { error: rpcErr } = await supabase.rpc('admin_update_user_password', { 
            p_user_id: trimId, 
            p_new_password: trimPass 
          });
          if (rpcErr) {
            console.error('Password update error:', rpcErr);
            setMessage('❌ فشل في تحديث كلمة المرور: ' + rpcErr.message);
            return;
          }
        } catch (err) {
          console.warn('RPC update password:', err);
        }
      }
      await supabase.from('users').update(payload).eq('user_id', trimId);
      setMessage('✅ تم تعديل بيانات المستخدم' + (trimPass ? ' وتحديث كلمة المرور المشفرة' : '') + ' بنجاح');
    } else {
      await supabase.from('users').insert({ user_id: trimId, password: trimPass, ...payload });
      setMessage('✅ تمت إضافة المستخدم بنجاح');
    }

    // Sync student enrollment in selected subjects
    if (addingType === 'student') {
      for (const sub of allSubjects) {
        const currentEnrolled = Array.isArray(sub.enrolled_students) ? sub.enrolled_students : [];
        const isSelected = selectedEnrollSubjects.includes(sub.id);

        if (isSelected && !currentEnrolled.includes(trimId)) {
          const updated = [...currentEnrolled, trimId];
          await supabase.from('subjects').update({ enrolled_students: updated, included_students: updated }).eq('id', sub.id);
        } else if (!isSelected && currentEnrolled.includes(trimId)) {
          const updated = currentEnrolled.filter(id => id !== trimId);
          await supabase.from('subjects').update({ enrolled_students: updated, included_students: updated }).eq('id', sub.id);
        }
      }
    }

    setUserId(''); setName(''); setPassword(''); setConfirmPassword(''); setEditMode(false); setAssignedSubjects([]); setSelectedEnrollSubjects([]); setSection('S1');
    setShowAddModal(false);
    cacheManager.invalidate('admin_users_base');
    fetchData();
    setTimeout(() => setMessage(''), 4000);
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

  const handleExcelImport = async (e) => {
    e.preventDefault();
    if (!file) return;

    setImporting(true);
    setMessage('');

    try {
      const rows = await parseExcelFile(file);
      let count = 0;

      // Helper: case-insensitive column getter
      const getVal = (row, ...keys) => {
        for (const k of keys) {
          for (const rk of Object.keys(row)) {
            if (rk.toLowerCase().trim() === k.toLowerCase().trim()) return row[rk];
          }
        }
        return undefined;
      };

      // Build per-student subject-section map: { userId: { subjectName: section } }
      const studentSubjectSections = {};

      for (const row of rows) {
        const id = (getVal(row, 'ID', 'الرقم الأكاديمي', 'الكود', 'رقم الجلوس'))?.toString().trim();
        const n = (getVal(row, 'Name', 'الاسم', 'اسم الطالب'))?.toString().trim();
        
        // Separate Student Level (فرقة الطالب) vs Course Level (فرقة المادة)
        const stuLevelRaw = getVal(row, 'StudentLevel', 'Student_Level', 'Student Level', 'StudentYear', 'Student_Year', 'فرقة الطالب', 'مستوى الطالب', 'Year', 'YEAR', 'الفرقة', 'السنة', 'Level', 'المستوى');
        const courseLevelRaw = getVal(row, 'CourseLevel', 'Course_Level', 'Course Level', 'CourseYear', 'Course_Year', 'فرقة المادة', 'فرقة المقرر', 'مستوى المادة', 'مستوى المقرر', 'Year', 'YEAR', 'الفرقة', 'السنة', 'Level', 'المستوى');
        
        const studentYear = normalizeYear(stuLevelRaw || '1');
        const courseYear = normalizeYear(courseLevelRaw || stuLevelRaw || '1');
        
        const sRaw = getVal(row, 'Section', 'السكشن', 'سكشن', 'Sec');
        const s = normalizeSection(sRaw || 'S1');
        const pass = (getVal(row, 'Password', 'كلمة السر') || id)?.toString().trim();
        const subjectName = (getVal(row, 'Subject', 'المادة', 'اسم المادة'))?.toString().trim();

        if (id && n) {
          // Track per-subject section
          if (subjectName) {
            if (!studentSubjectSections[id]) studentSubjectSections[id] = {};
            studentSubjectSections[id][subjectName] = s;
          }

          const { data: existingUser } = await supabase.from('users').select('id, assigned_subjects').eq('user_id', id).single();
          if (!existingUser) {
            await supabase.from('users').insert({
              user_id: id,
              name: n,
              password: pass,
              role: 'student',
              year_level: studentYear,
              section: s,
              auth_id: null
            });
            count++;
          } else {
            await supabase.from('users').update({
              name: n,
              year_level: studentYear,
              section: s
            }).eq('user_id', id);
            count++;
          }
        }
      }

      // Update per-subject sections in assigned_subjects for students
      if (Object.keys(studentSubjectSections).length > 0) {
        const { data: allSubs } = await supabase.from('subjects').select('id, name');
        const subNameToId = {};
        (allSubs || []).forEach(sub => { subNameToId[sub.name.toLowerCase().trim()] = sub.id; });

        for (const [stuId, subSecs] of Object.entries(studentSubjectSections)) {
          const entries = [];
          for (const [subName, sec] of Object.entries(subSecs)) {
            const subId = subNameToId[subName.toLowerCase().trim()];
            if (subId) entries.push(subId + ':' + sec);
          }
          if (entries.length > 0) {
            const { data: stuData } = await supabase.from('users').select('assigned_subjects').eq('user_id', stuId).single();
            const current = Array.isArray(stuData?.assigned_subjects) ? stuData.assigned_subjects : [];
            const subIdsInEntries = new Set(entries.map(e => e.split(':')[0]));
            const kept = current.filter(e => {
              const eSubId = typeof e === 'string' ? e.split(':')[0] : '';
              return !subIdsInEntries.has(eSubId);
            });
            const merged = [...kept, ...entries];
            await supabase.from('users').update({ assigned_subjects: merged }).eq('user_id', stuId);
          }
        }
      }

      setMessage('✅ تم استيراد وتحديث بيانات ' + count + ' طالب بنجاح');
      setShowExcelImport(false);
      setFile(null);
      fetchData();
    } catch (err) {
      console.error(err);
      setMessage('❌ حدث خطأ أثناء قراءة ملف الإكسيل، يرجى التأكد من التنسيق');
    } finally {
      setImporting(false);
      setTimeout(() => setMessage(''), 5000);
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
                const isSuper = adm.user_id === 'admin';
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
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem'
        }}>
          <div className="panel fade-in" style={{maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto'}}>
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

              <div style={{display:'flex',gap:'10px',marginTop:'1rem'}}>
                <button type="submit" className="btn-primary" style={{flex:1}}>
                  {editMode ? 'حفظ التعديلات' : 'إضافة المستخدم'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
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
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem'
        }}>
          <div className="panel fade-in" style={{maxWidth: '500px', width: '100%'}}>
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

    </div>
  );
}
