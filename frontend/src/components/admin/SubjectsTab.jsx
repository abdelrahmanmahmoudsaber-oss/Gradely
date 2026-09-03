import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { parseExcelFile } from '../../utils/excelHelper';
import { cacheManager } from '../../utils/dataCache';
import { BookOpen, Upload, Plus, Trash2, Edit, Users, UserCheck, X, CheckSquare, Square, Shield, Layers } from 'lucide-react';

const DEFAULT_SECTIONS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

export default function SubjectsTab({ user }) {
  const [subjects, setSubjects] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form states
  const [subjectName, setSubjectName] = useState('');
  const [totalWeeks, setTotalWeeks] = useState(12);
  const [yearLevel, setYearLevel] = useState('1');
  const [instructorId, setInstructorId] = useState('');
  const [sectionInstructors, setSectionInstructors] = useState({}); // { 'S1': 'ta_id_1', 'S2': 'ta_id_2' }
  const [modalCustomSections, setModalCustomSections] = useState([]);

  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');

  // Bulk Selection
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]);

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
    if (match) return 'S' + parseInt(match[1], 10);
    return 'S1';
  };

  useEffect(() => {
    fetchInitial();
  }, []);

  const fetchInitial = async () => {
    const [subRes, userRes] = await Promise.all([
      supabase.from('subjects').select('*').order('created_at', { ascending: false }),
      supabase.from('users').select('*')
    ]);

    if (subRes.data) setSubjects(subRes.data);
    if (userRes.data) setAllUsers(userRes.data);
  };

  const instructorsList = allUsers.filter(u => u.role === 'admin');

  // Helper to extract section mapping for a subject from allUsers
  const getSubjectSectionMapping = (subId, usersList) => {
    const secMap = {};
    usersList.forEach(u => {
      if (u.role === 'admin' && Array.isArray(u.assigned_subjects)) {
        u.assigned_subjects.forEach(entry => {
          if (entry === subId) {
            // General assignment
          } else if (typeof entry === 'string' && entry.startsWith(subId + ':')) {
            const sec = entry.split(':')[1];
            if (sec) secMap[sec] = u.user_id;
          }
        });
      }
    });
    return secMap;
  };

  const getSubjectModalSections = () => {
    const secs = new Set();
    Object.keys(sectionInstructors).forEach(s => { if (s) secs.add(s); });
    if (editingId) {
      const sub = subjects.find(s => s.id === editingId);
      if (sub && Array.isArray(sub.enrolled_students)) {
        sub.enrolled_students.forEach(uid => {
          const stu = allUsers.find(u => u.user_id === uid);
          if (stu) {
            let sSec = null;
            if (Array.isArray(stu.assigned_subjects)) {
              const match = stu.assigned_subjects.find(e => typeof e === 'string' && e.startsWith(sub.id + ':'));
              if (match) sSec = match.split(':')[1];
            }
            if (!sSec) sSec = stu.section;
            if (sSec) secs.add(normalizeSection(sSec));
          }
        });
      }
    }
    modalCustomSections.forEach(s => { if (s) secs.add(s); });
    if (secs.size === 0) secs.add('S1');
    return [...secs].sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '') || '0', 10);
      const numB = parseInt(b.replace(/\D/g, '') || '0', 10);
      return numA - numB;
    });
  };

  const handleAddModalSection = () => {
    const current = getSubjectModalSections();
    let maxNum = 0;
    current.forEach(s => {
      const n = parseInt(s.replace(/\D/g, '') || '0', 10);
      if (n > maxNum) maxNum = n;
    });
    const newSec = 'S' + (maxNum + 1);
    setModalCustomSections(prev => [...prev, newSec]);
  };

  const handleRemoveModalSection = (sec) => {
    setModalCustomSections(prev => prev.filter(s => s !== sec));
    setSectionInstructors(prev => {
      const next = { ...prev };
      delete next[sec];
      return next;
    });
  };

  const handleSectionTAChange = (sec, taId) => {
    setSectionInstructors(prev => ({
      ...prev,
      [sec]: taId
    }));
  };

  const handleSaveSubject = async (e) => {
    e.preventDefault();
    const trimName = subjectName.trim();
    if (!trimName) return;

    const selectedTA = instructorsList.find(t => t.user_id === instructorId);
    const instName = selectedTA ? selectedTA.name : instructorId === 'admin' ? 'المدير الرئيسي' : '';

    const payload = {
      name: trimName,
      total_weeks: parseInt(totalWeeks, 10) || 12,
      year_level: studentYearearLevel,
      instructor_id: instructorId || null,
      instructor_name: instName || null
    };

    let targetSubjectId = editingId;

    if (editMode && editingId) {
      await supabase.from('subjects').update(payload).eq('id', editingId);
      setMessage('✅ تم تحديث بيانات المادة وتوزيع معيدي السكاشن بنجاح');
    } else {
      const targetStudents = allUsers
        .filter(u => u.role === 'student' && normalizeYear(u.year_level) === yearLevel)
        .map(u => u.user_id);

      const insertRes = await supabase.from('subjects').insert({
        ...payload,
        enrolled_students: targetStudents,
        included_students: targetStudents
      }).select().single();

      if (insertRes.data) targetSubjectId = insertRes.data.id;
      setMessage('✅ تمت إضافة المادة وتعيين معيدي السكاشن بنجاح');
    }

    // Persist section assignments in users.assigned_subjects
    if (targetSubjectId) {
      for (const ta of instructorsList) {
        if (ta.user_id === 'admin') continue;

        // Current assigned items for this TA without this subject
        const currentEntries = (Array.isArray(ta.assigned_subjects) ? ta.assigned_subjects : [])
          .filter(e => e !== targetSubjectId && !e.startsWith(targetSubjectId + ':'));

        const newEntriesForThisSub = [];

        // If TA is selected as general instructor
        if (instructorId === ta.user_id) {
          newEntriesForThisSub.push(targetSubjectId);
        }

        // If TA is assigned specific sections
        DEFAULT_SECTIONS.forEach(sec => {
          if (sectionInstructors[sec] === ta.user_id) {
            newEntriesForThisSub.push(targetSubjectId + ':' + sec);
          }
        });

        const updatedAssigned = [...new Set([...currentEntries, ...newEntriesForThisSub])];
        await supabase.from('users').update({ assigned_subjects: updatedAssigned }).eq('id', ta.id);
      }
    }

    setSubjectName('');
    setTotalWeeks(12);
    setYearLevel('1');
    setInstructorId('');
    setSectionInstructors({});
    setEditMode(false);
    setEditingId(null);
    setShowModal(false);
    fetchInitial();
    setTimeout(() => setMessage(''), 4000);
  };

  const handleEdit = (sub) => {
    setSubjectName(sub.name);
    setTotalWeeks(sub.total_weeks || 12);
    setYearLevel(normalizeYear(sub.year_level));
    setInstructorId(sub.instructor_id || '');

    // Load section mapping from users.assigned_subjects
    const secMap = getSubjectSectionMapping(sub.id, allUsers);
    setSectionInstructors(secMap);

    setEditMode(true);
    setEditingId(sub.id);
    setShowModal(true);
  };

  const handleDelete = async (id, name) => {
    if (window.confirm('هل أنت متأكد من حذف مادة (' + name + ')؟ سيتم حذف جميع درجاتها وسجلات غيابها!')) {
      await supabase.from('attendance').delete().eq('subject_id', id);
      await supabase.from('grades').delete().eq('subject_id', id);
      await supabase.from('subjects').delete().eq('id', id);
      
      for (const ta of instructorsList) {
        if (Array.isArray(ta.assigned_subjects)) {
          const updated = ta.assigned_subjects.filter(sid => sid !== id && !sid.startsWith(id + ':'));
          await supabase.from('users').update({ assigned_subjects: updated }).eq('id', ta.id);
        }
      }

      fetchInitial();
      setMessage('🗑️ تم حذف المادة بنجاح');
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const handleBulkDeleteSubjects = async () => {
    if (selectedSubjectIds.length === 0) return;
    if (!window.confirm('هل أنت متأكد من حذف (' + selectedSubjectIds.length + ') مادة نهائياً؟ سيتم حذف كافة الدرجات وسجلات الغياب المرتبطة بها!')) return;

    try {
      await supabase.from('attendance').delete().in('subject_id', selectedSubjectIds);
      await supabase.from('grades').delete().in('subject_id', selectedSubjectIds);
      await supabase.from('subjects').delete().in('id', selectedSubjectIds);

      for (const ta of instructorsList) {
        if (Array.isArray(ta.assigned_subjects)) {
          const updated = ta.assigned_subjects.filter(sid => {
            const baseId = sid.split(':')[0];
            return !selectedSubjectIds.includes(baseId);
          });
          await supabase.from('users').update({ assigned_subjects: updated }).eq('id', ta.id);
        }
      }

      setMessage('🗑️ تم حذف (' + selectedSubjectIds.length + ') مادة بنجاح!');
      setSelectedSubjectIds([]);
      fetchInitial();
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      console.error('Bulk delete subjects error:', err);
      setMessage('❌ حدث خطأ أثناء حذف المواد');
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setMessage('');

    try {
      const rows = await parseExcelFile(file);
      const subjectsMap = {};

      // Helper: case-insensitive column getter
      const getVal = (row, ...keys) => {
        for (const k of keys) {
          for (const rk of Object.keys(row)) {
            if (rk.toLowerCase().trim() === k.toLowerCase().trim()) return row[rk];
          }
        }
        return undefined;
      };

      // Track per-student { subjectName: section }
      const studentSubjectSections = {};

      for (const row of rows) {
        const subName = (getVal(row, 'Subject', 'المادة', 'اسم المادة'))?.toString().trim();
        const id = (getVal(row, 'ID', 'رقم الجلوس', 'الكود'))?.toString().trim();
        const name = (getVal(row, 'Name', 'الاسم', 'اسم الطالب'))?.toString().trim();
        // Separate Student Level (فرقة الطالب) vs Course Level (فرقة المادة)
        const stuLevelRaw = getVal(row, 'StudentLevel', 'Student_Level', 'Student Level', 'StudentYear', 'Student_Year', 'فرقة الطالب', 'مستوى الطالب', 'Year', 'YEAR', 'الفرقة', 'السنة', 'Level', 'المستوى');
        const courseLevelRaw = getVal(row, 'CourseLevel', 'Course_Level', 'Course Level', 'CourseYear', 'Course_Year', 'فرقة المادة', 'فرقة المقرر', 'مستوى المادة', 'مستوى المقرر', 'Year', 'YEAR', 'الفرقة', 'السنة', 'Level', 'المستوى');
        
        const studentYear = normalizeYear(stuLevelRaw || '1');
        const courseYear = normalizeYear(courseLevelRaw || stuLevelRaw || '1');
        const sRaw = getVal(row, 'Section', 'السكشن', 'سكشن', 'Sec');
        const s = normalizeSection(sRaw || 'S1');
        const pass = (getVal(row, 'Password', 'كلمة السر') || id)?.toString().trim();
        const ta = (getVal(row, 'TA', 'المعيد', 'اسم المعيد', 'المشرف'))?.toString().trim();

        if (id && name) {
          // Track per-subject section for this student
          if (subName) {
            if (!studentSubjectSections[id]) studentSubjectSections[id] = {};
            studentSubjectSections[id][subName] = s;
          }

          const { data: existingUser } = await supabase.from('users').select('id').eq('user_id', id).single();
          if (!existingUser) {
            await supabase.from('users').insert({
              user_id: id,
              name: name,
              password: pass,
              role: 'student',
              year_level: studentYear,
              section: s,
              auth_id: null
            });
          } else {
            await supabase.from('users').update({
              name: name,
              year_level: y,
              section: s
            }).eq('user_id', id);
          }

          if (subName) {
            if (!subjectsMap[subName]) {
              subjectsMap[subName] = { year: courseYear, taName: ta || '', students: [], sectionTAs: {} };
            }
            if (!subjectsMap[subName].students.includes(id)) {
              subjectsMap[subName].students.push(id);
            }
            if (ta && s) {
              subjectsMap[subName].sectionTAs[s] = ta;
            }
          }
        }
      }

      // Create/update subjects
      const subNameToId = {};
      for (const sName of Object.keys(subjectsMap)) {
        const item = subjectsMap[sName];
        let mainTaObj = instructorsList.find(t => t.name?.toLowerCase().includes(item.taName?.toLowerCase()) || t.user_id === item.taName);
        
        let createdOrUpdatedSubId = null;
        const { data: existingSub } = await supabase.from('subjects').select('*').eq('name', sName).single();
        
        if (existingSub) {
          createdOrUpdatedSubId = existingSub.id;
          const currentEnrolled = Array.isArray(existingSub.enrolled_students) ? existingSub.enrolled_students : [];
          const merged = [...new Set([...currentEnrolled, ...item.students])];
          await supabase.from('subjects').update({
            enrolled_students: merged,
            included_students: merged,
            year_level: item.year,
            instructor_id: mainTaObj ? mainTaObj.user_id : existingSub.instructor_id,
            instructor_name: mainTaObj ? mainTaObj.name : existingSub.instructor_name
          }).eq('id', existingSub.id);
        } else {
          const { data: newSub } = await supabase.from('subjects').insert({
            name: sName,
            year_level: item.year,
            total_weeks: 12,
            instructor_id: mainTaObj ? mainTaObj.user_id : null,
            instructor_name: mainTaObj ? mainTaObj.name : null,
            enrolled_students: item.students,
            included_students: item.students
          }).select().single();
          if (newSub) createdOrUpdatedSubId = newSub.id;
        }

        if (createdOrUpdatedSubId) {
          subNameToId[sName.toLowerCase().trim()] = createdOrUpdatedSubId;
        }

        // Link section TAs in users.assigned_subjects
        if (createdOrUpdatedSubId) {
          for (const secKey of Object.keys(item.sectionTAs)) {
            const taStr = item.sectionTAs[secKey];
            const taFound = instructorsList.find(t => t.name?.toLowerCase().includes(taStr?.toLowerCase()) || t.user_id === taStr);
            if (taFound) {
              const currentArr = Array.isArray(taFound.assigned_subjects) ? taFound.assigned_subjects : [];
              const entry = createdOrUpdatedSubId + ':' + secKey;
              if (!currentArr.includes(entry)) {
                await supabase.from('users').update({ assigned_subjects: [...currentArr, entry] }).eq('id', taFound.id);
              }
            }
          }

          // Also link main TA
          if (mainTaObj) {
            const currentArr = Array.isArray(mainTaObj.assigned_subjects) ? mainTaObj.assigned_subjects : [];
            // Check if any entry for this subject already exists
            const hasEntry = currentArr.some(e => typeof e === 'string' && e.startsWith(createdOrUpdatedSubId + ':'));
            if (!hasEntry) {
              // Add for all sections of this subject
              const subSections = new Set();
              item.students.forEach(stuId => {
                const stuSec = studentSubjectSections[stuId]?.[sName];
                if (stuSec) subSections.add(stuSec);
              });
              if (subSections.size === 0) subSections.add('S1');
              const newEntries = [...subSections].map(sec => createdOrUpdatedSubId + ':' + sec);
              const merged = [...currentArr, ...newEntries];
              await supabase.from('users').update({ assigned_subjects: merged }).eq('id', mainTaObj.id);
              mainTaObj.assigned_subjects = merged;
            }
          }
        }
      }

      // Update per-subject sections on student records
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

      fetchInitial();
      setMessage('✅ تم استيراد المواد والطلاب وتوزيع السكاشن والمعيدين بنجاح!');
      setShowExcelImport(false);
    } catch (err) {
      console.error('Excel import error:', err);
      setMessage('❌ ' + (err.message || 'حدث خطأ أثناء معالجة ملف الإكسيل'));
    }
    setImporting(false);
    setFile(null);
    setTimeout(() => setMessage(''), 5000);
  };

  const toggleSelectAllSubjects = () => {
    if (selectedSubjectIds.length === subjects.length && subjects.length > 0) {
      setSelectedSubjectIds([]);
    } else {
      setSelectedSubjectIds(subjects.map(s => s.id));
    }
  };

  return (
    <div className="fade-in">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'2rem',flexWrap:'wrap',gap:'1rem'}}>
        <div>
          <h2 style={{margin:0,fontSize:'1.6rem',fontWeight:800}}>إدارة المواد الدراسية</h2>
          <p className="text-muted" style={{margin:'5px 0 0 0'}}>إنشاء وتعديل المقررات الدراسية، تعيين المعيدين لكل سكشن، وتسجيل الطلاب</p>
        </div>
        <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
          {selectedSubjectIds.length > 0 && (
            <button className="btn-secondary" onClick={handleBulkDeleteSubjects} style={{color:'var(--danger)',borderColor:'var(--danger)',background:'rgba(239, 68, 68, 0.1)',fontWeight:700}}>
              <Trash2 size={18} /> حذف المواد المحددة ({selectedSubjectIds.length})
            </button>
          )}
          <button className="btn-secondary" onClick={() => setShowExcelImport(!showExcelImport)}>
            <Upload size={18} /> استيراد مواد وطلاب من Excel
          </button>
          <button className="btn-primary" onClick={() => {
            setSubjectName(''); setTotalWeeks(12); setYearLevel('1'); setInstructorId(''); setSectionInstructors({}); setEditMode(false); setEditingId(null);
            setShowModal(true);
          }}>
            <Plus size={18} /> إضافة مادة جديدة
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          background: message.startsWith('✅') ? 'rgba(16, 185, 129, 0.1)' : message.startsWith('🗑️') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.15)',
          border: message.startsWith('✅') ? '1px solid var(--success)' : '1px solid var(--danger)',
          color: message.startsWith('✅') ? 'var(--success)' : 'var(--danger)',
          padding: '12px 16px', borderRadius: '8px', marginBottom: '1.5rem', fontWeight: 'bold'
        }}>
          {message}
        </div>
      )}

      {/* CENTERED POPUP MODAL (Add / Edit Subject with Section TA Assignments) */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '1rem'
        }}>
          <div className="panel fade-in" style={{
            width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto',
            background: 'var(--surface)', border: '1px solid var(--primary)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)', position: 'relative'
          }}>
            <button 
              onClick={() => { setShowModal(false); setEditMode(false); }}
              style={{
                position: 'absolute', left: '16px', top: '16px',
                background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center'
              }}
            >
              <X size={20} />
            </button>

            <h3 style={{marginTop:0, marginBottom:'1.5rem', color:'var(--primary-hover)'}}>
              {editMode ? 'تعديل المادة وتوزيع معيدي السكاشن' : 'إضافة مادة دراسية جديدة'}
            </h3>

            <form onSubmit={handleSaveSubject} style={{display:'flex',flexDirection:'column',gap:'1.2rem'}}>
              <div>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem'}}>اسم المادة الدراسية:</label>
                <input className="input-field" type="text" value={subjectName} onChange={e=>setSubjectName(e.target.value)} required placeholder="مثال: الرياضيات المتقدمة 2" />
              </div>
              
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>
                <div>
                  <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem'}}>الفرقة الدراسية:</label>
                  <select className="input-field" value={yearLevel} onChange={e=>setYearLevel(e.target.value)}>
                    <option value="1">الفرقة الأولى (1)</option>
                    <option value="2">الفرقة الثانية (2)</option>
                    <option value="3">الفرقة الثالثة (3)</option>
                    <option value="4">الفرقة الرابعة (4)</option>
                  </select>
                </div>
                <div>
                  <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem'}}>عدد الأسابيع:</label>
                  <input className="input-field" type="number" min="1" max="20" value={totalWeeks} onChange={e=>setTotalWeeks(e.target.value)} required />
                </div>
              </div>

              <div>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',color:'var(--primary-hover)',fontWeight:'bold'}}>
                  المشرف العام / المعيد الرئيسي للمادة:
                </label>
                <select className="input-field" value={instructorId} onChange={e=>setInstructorId(e.target.value)}>
                  <option value="">-- اختياري (المدير الرئيسي افتراضياً) --</option>
                  <option value="admin">المدير الرئيسي (Admin)</option>
                  {instructorsList.filter(u => u.user_id !== 'admin').map(inst => (
                    <option key={inst.id} value={inst.user_id}>
                      {inst.name} ({inst.user_id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Section-by-Section TA Assignment */}
              <div style={{background:'var(--bg)',padding:'1.2rem',borderRadius:'10px',border:'1px solid var(--border)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px',flexWrap:'wrap',gap:'8px'}}>
                  <label style={{margin:0,fontSize:'0.95rem',color:'var(--success)',fontWeight:'bold'}}>
                    🎯 توزيع معيدي السكاشن (حسب سكاشن المادة الفعلية):
                  </label>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={handleAddModalSection}
                    style={{padding:'4px 10px',fontSize:'0.8rem',color:'var(--primary-hover)',borderColor:'var(--primary)'}}
                  >
                    + إضافة سكشن
                  </button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))',gap:'10px'}}>
                  {getSubjectModalSections().map(sec => (
                    <div key={sec} style={{display:'flex',alignItems:'center',gap:'8px',background:'rgba(255,255,255,0.02)',padding:'6px 8px',borderRadius:'6px',border:'1px solid rgba(255,255,255,0.05)'}}>
                      <span className="badge" style={{background:'rgba(16, 185, 129, 0.1)',color:'var(--success)',minWidth:'40px',textAlign:'center'}}>{sec}</span>
                      <select 
                        className="input-field" 
                        value={sectionInstructors[sec] || ''} 
                        onChange={e => handleSectionTAChange(sec, e.target.value)}
                        style={{padding:'6px 8px',fontSize:'0.85rem',flex:1}}
                      >
                        <option value="">-- نفس المشرف الرئيسي --</option>
                        <option value="admin">المدير الرئيسي</option>
                        {instructorsList.filter(u => u.user_id !== 'admin').map(inst => (
                          <option key={inst.id} value={inst.user_id}>
                            {inst.name}
                          </option>
                        ))}
                      </select>
                      {getSubjectModalSections().length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => handleRemoveModalSection(sec)}
                          style={{background:'none',border:'none',color:'var(--danger)',cursor:'pointer',padding:'2px 4px',fontSize:'1rem'}}
                          title="حذف هذا السكشن"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{display:'flex',gap:'10px',marginTop:'10px',justifyContent:'flex-end'}}>
                <button className="btn-secondary" type="button" onClick={() => { setShowModal(false); setEditMode(false); }}>
                  إلغاء
                </button>
                <button className="btn-primary" type="submit">
                  {editMode ? 'حفظ التعديلات' : 'إضافة المادة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Import Panel */}
      {showExcelImport && (
        <div className="panel fade-in" style={{marginBottom:'2rem', border: '1px solid var(--primary)'}}>
          <h3 style={{marginTop:0, marginBottom:'0.5rem', color:'var(--primary-hover)'}}>استيراد مواد وطلاب معاً عبر ملف Excel</h3>
          <p className="text-muted" style={{fontSize:'0.85rem',marginBottom:'1rem'}}>
            الأعمدة المطلوبة: <strong>Subject (اسم المادة) | ID (رقم الجلوس) | Name (اسم الطالب) | Section (السكشن: S1, S01, S2...) | Year (الفرقة) | Password (كلمة المرور) | TA (المعيد)</strong>
          </p>
          <div style={{display:'flex',gap:'1rem',alignItems:'center',flexWrap:'wrap'}}>
            <input className="input-field" type="file" accept=".xlsx, .xls" onChange={e=>setFile(e.target.files[0])} style={{padding: '10px 14px', flex: 1, minWidth: '250px'}}/>
            <button className="btn-primary" onClick={handleImport} disabled={!file || importing}>
              {importing ? 'جاري الاستيراد...' : 'بدء الاستيراد'}
            </button>
          </div>
        </div>
      )}

      {/* Select All Toggle */}
      {subjects.length > 0 && (
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',padding:'0 4px'}}>
          <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontSize:'0.95rem',fontWeight:600}}>
            <input 
              type="checkbox" 
              checked={selectedSubjectIds.length === subjects.length && subjects.length > 0}
              onChange={toggleSelectAllSubjects}
            />
            <span>تحديد كل المواد ({subjects.length})</span>
          </label>
          {selectedSubjectIds.length > 0 && (
            <span style={{fontSize:'0.9rem',color:'var(--primary-hover)',fontWeight:'bold'}}>
              تم تحديد {selectedSubjectIds.length} مادة
            </span>
          )}
        </div>
      )}

      {/* Subjects Grid */}
      <div className="grid-cards">
        {subjects.map(sub => {
          const enrolledCount = Array.isArray(sub.enrolled_students) ? sub.enrolled_students.length : (Array.isArray(sub.included_students) ? sub.included_students.length : 0);
          const isSelected = selectedSubjectIds.includes(sub.id);
          
          // Get section mapping from users
          const secMap = getSubjectSectionMapping(sub.id, allUsers);
          const assignedSections = Object.keys(secMap);

          return (
            <div key={sub.id} className="panel" style={{
              display:'flex',flexDirection:'column',justifyContent:'space-between',
              border: isSelected ? '1px solid var(--primary-hover)' : '1px solid var(--border)',
              background: isSelected ? 'rgba(79, 70, 229, 0.08)' : 'var(--surface)',
              position: 'relative'
            }}>
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1rem'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedSubjectIds([...selectedSubjectIds, sub.id]);
                        else setSelectedSubjectIds(selectedSubjectIds.filter(id => id !== sub.id));
                      }}
                    />
                    <h3 style={{margin:0,fontSize:'1.2rem'}}>{sub.name}</h3>
                  </div>
                  <span className="badge" style={{background:'rgba(79, 70, 229, 0.1)',color:'var(--primary-hover)'}}>
                    فرقة {normalizeYear(sub.year_level)}
                  </span>
                </div>

                <div style={{display:'flex',flexDirection:'column',gap:'8px',marginBottom:'1.5rem',fontSize:'0.9rem',color:'var(--text-muted)'}}>
                  <div>🗓️ إجمالي الأسابيع: <strong style={{color:'var(--text-main)'}}>{sub.total_weeks || 12} أسبوع</strong></div>
                  <div>👥 الطلاب المسجلون: <strong style={{color:'var(--text-main)'}}>{enrolledCount} طالب</strong></div>
                  <div>
                    <span>🧑‍🏫 المشرف الرئيسي: </span>
                    <strong style={{color:'var(--success)'}}>
                      {sub.instructor_name || (sub.instructor_id === 'admin' ? 'المدير الرئيسي' : 'المدير الرئيسي')}
                    </strong>
                  </div>

                  {assignedSections.length > 0 && (
                    <div style={{marginTop:'4px',background:'var(--bg)',padding:'8px',borderRadius:'6px',border:'1px solid var(--border)'}}>
                      <span style={{fontSize:'0.8rem',display:'block',color:'var(--primary-hover)',fontWeight:'bold',marginBottom:'4px'}}>معيدو السكاشن:</span>
                      <div style={{display:'flex',flexDirection:'column',gap:'3px',fontSize:'0.8rem'}}>
                        {assignedSections.map(secKey => {
                          const taUserId = secMap[secKey];
                          const taObj = instructorsList.find(t => t.user_id === taUserId);
                          return (
                            <div key={secKey} style={{display:'flex',justifyContent:'space-between'}}>
                              <span style={{color:'var(--text-main)'}}>{secKey}:</span>
                              <span style={{color:'var(--success)',fontWeight:'bold'}}>{taObj ? taObj.name : taUserId}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{display:'flex',gap:'8px',borderTop:'1px solid var(--border)',paddingTop:'1rem'}}>
                <button className="btn-secondary" onClick={() => handleEdit(sub)} style={{flex:1,padding:'8px',fontSize:'0.9rem'}}>
                  <Edit size={16} /> تعديل
                </button>
                <button className="btn-secondary" onClick={() => handleDelete(sub.id, sub.name)} style={{color:'var(--danger)',padding:'8px'}} title="حذف المادة">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
        {subjects.length === 0 && (
          <div className="panel" style={{gridColumn:'1 / -1',textAlign:'center',padding:'3rem',color:'var(--text-muted)'}}>
            <BookOpen size={48} style={{marginBottom:'1rem',opacity:0.5}} />
            <h3 style={{margin:'0 0 10px 0',color:'var(--text-main)'}}>لا توجد مقررات دراسية حالياً</h3>
            <p style={{margin:0,fontSize:'0.9rem'}}>ابدأ بإضافة مادة جديدة أو استيراد المواد والطلاب عبر ملف Excel.</p>
          </div>
        )}
      </div>
    </div>
  );
}
