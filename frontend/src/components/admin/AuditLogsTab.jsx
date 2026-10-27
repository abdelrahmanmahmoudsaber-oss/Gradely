import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { ShieldAlert, RefreshCw, Search, Filter, History, Clock, User, Eye, CheckCircle2, AlertTriangle, BookOpen, Calendar, GraduationCap, Layers, List, Users } from 'lucide-react';

export default function AuditLogsTab({ user }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [tableFilter, setTableFilter] = useState('all'); // 'all', 'grades', 'attendance', 'users'
  const [actionFilter, setActionFilter] = useState('all'); // 'all', 'INSERT', 'UPDATE', 'DELETE'
  const [actorFilter, setActorFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState(null);

  // Grouped / Clustered View State
  const [viewMode, setViewMode] = useState('grouped'); // 'grouped' or 'flat'
  const [selectedGroupModal, setSelectedGroupModal] = useState(null);

  // Lookup maps for human readable names
  const [subjectsMap, setSubjectsMap] = useState({});
  const [subjectsList, setSubjectsList] = useState([]);
  const [studentsMap, setStudentsMap] = useState({});
  const [studentsYearMap, setStudentsYearMap] = useState({});
  const [actorsList, setActorsList] = useState([]);
  const [yearFilter, setYearFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    fetchAuditLogs();
  }, [tableFilter, actionFilter, actorFilter]);

  const fetchMetadata = async () => {
    try {
      const [subRes, stuRes] = await Promise.all([
        supabase.from('subjects').select('id, name'),
        supabase.from('users').select('user_id, name, year_level, section, role')
      ]);

      const subMap = {};
      const subArr = [];
      (subRes.data || []).forEach(s => {
        subMap[s.id] = s.name;
        subArr.push({ id: s.id, name: s.name });
      });
      setSubjectsMap(subMap);
      setSubjectsList(subArr);

      const stuMap = {};
      const stuYrMap = {};
      const adminList = [];
      (stuRes.data || []).forEach(u => {
        stuMap[u.user_id] = u.name;
        stuYrMap[u.user_id] = u.year_level;
        if (u.role === 'admin' || u.role === 'super_admin') {
          adminList.push({ user_id: u.user_id, name: u.name, role: u.role });
        }
      });
      setStudentsMap(stuMap);
      setStudentsYearMap(stuYrMap);
      if (adminList.length > 0) {
        setActorsList(adminList);
      }
    } catch (e) {
      console.warn('Metadata fetch error in AuditLogsTab:', e);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError('');

      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(400);

      if (tableFilter !== 'all') {
        query = query.eq('table_name', tableFilter);
      }

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      if (actorFilter !== 'all') {
        query = query.eq('actor_user_id', actorFilter);
      }

      const { data, error: fetchErr } = await query;

      if (fetchErr) {
        throw fetchErr;
      }

      const rawLogs = data || [];
      setLogs(rawLogs);

      // Merge any actors seen in logs with known adminList
      setActorsList(prev => {
        const existingIds = new Set(prev.map(a => typeof a === 'object' ? a.user_id : a));
        const newOnes = [];
        rawLogs.forEach(l => {
          if (l.actor_user_id && !existingIds.has(l.actor_user_id)) {
            existingIds.add(l.actor_user_id);
            newOnes.push({ user_id: l.actor_user_id, name: l.actor_user_id });
          }
        });
        return [...prev, ...newOnes];
      });

    } catch (err) {
      console.error('Audit logs fetch error:', err);
      setError('تعذر تحميل سجل الرقابة والتغييرات: ' + (err.message || 'يرجى التأكد من تشغيل سكريبت إنشاء الجدول'));
    } finally {
      setLoading(false);
    }
  };

  // Human-readable labels
  const getTableLabel = (tableName) => {
    switch (tableName) {
      case 'grades': return '📊 رصد الدرجات';
      case 'attendance': return '📅 كشف الغياب';
      case 'users': return '👤 حسابات المستخدمين';
      case 'subjects': return '📚 المقررات الدراسية';
      default: return tableName;
    }
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'INSERT':
        return <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '3px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700 }}>➕ إضافة</span>;
      case 'UPDATE':
        return <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', padding: '3px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700 }}>✏️ تعديل</span>;
      case 'DELETE':
        return <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '3px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700 }}>🗑️ حذف</span>;
      default:
        return <span>{action}</span>;
    }
  };

  const statusAr = (s) => {
    if (s === 'present') return 'حاضر ✓';
    if (s === 'absent') return 'غائب ✗';
    if (s === 'late') return 'تأخير';
    if (s === 'excused') return 'عذر';
    if (s === 'unrecorded') return 'لم يرصد';
    return s || '—';
  };

  // Compare old and new data to extract clean, informative diffs
  const renderLogDetails = (log) => {
    const data = log.new_data || log.old_data || {};
    const subName = subjectsMap[data.subject_id] || '';
    const stuId = data.student_id || data.user_id || log.record_id || '';
    const stuName = studentsMap[stuId] || '';
    const week = data.week_number ? `أسبوع ${data.week_number}` : '';

    if (log.table_name === 'attendance') {
      const oldStatus = log.old_data?.status;
      const newStatus = log.new_data?.status;

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            {subName && (
              <span style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', padding: '2px 7px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700 }}>
                📚 {subName}
              </span>
            )}
            {week && (
              <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '2px 7px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700 }}>
                🗓️ {week}
              </span>
            )}
            <span style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-main)', padding: '2px 7px', borderRadius: '4px', fontSize: '0.78rem' }}>
              👤 {stuName ? `${stuName} (${stuId})` : stuId}
            </span>
          </div>

          <div style={{ fontSize: '0.82rem', marginTop: '2px', color: 'var(--text-muted)' }}>
            {log.action === 'UPDATE' && oldStatus && newStatus ? (
              <span>
                تغيير حالة الحضور: <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{statusAr(oldStatus)}</span> ⬅️ <strong style={{ color: newStatus === 'present' ? 'var(--success)' : 'var(--danger)' }}>{statusAr(newStatus)}</strong>
              </span>
            ) : log.action === 'INSERT' ? (
              <span>رصد غياب مبدئي: <strong style={{ color: newStatus === 'present' ? 'var(--success)' : 'var(--danger)' }}>{statusAr(newStatus)}</strong></span>
            ) : (
              <span>حذف سجل غياب</span>
            )}
          </div>
        </div>
      );
    }

    if (log.table_name === 'grades') {
      const gradeChanges = [];
      const keys = ['quiz_1', 'quiz_2', 'project', 'attendance_score', 'final_grade'];
      const labels = { quiz_1: 'كويز 1', quiz_2: 'كويز 2', project: 'المشروع', attendance_score: 'درجة الحضور', final_grade: 'النهائي' };

      if (log.action === 'UPDATE' && log.old_data && log.new_data) {
        for (const k of keys) {
          if (log.old_data[k] !== log.new_data[k]) {
            gradeChanges.push(`${labels[k]}: (${log.old_data[k] ?? 'لم ترصد'} ⬅️ ${log.new_data[k] ?? 'لم ترصد'})`);
          }
        }
      }

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            {subName && (
              <span style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', padding: '2px 7px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700 }}>
                📚 {subName}
              </span>
            )}
            <span style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-main)', padding: '2px 7px', borderRadius: '4px', fontSize: '0.78rem' }}>
              👤 {stuName ? `${stuName} (${stuId})` : stuId}
            </span>
          </div>

          <div style={{ fontSize: '0.82rem', marginTop: '2px', color: '#38bdf8', fontWeight: 600 }}>
            {gradeChanges.length > 0 ? gradeChanges.join(' | ') : 'تحديث درجات الطالب'}
          </div>
        </div>
      );
    }

    if (log.table_name === 'users') {
      const oldD = log.old_data || {};
      const newD = log.new_data || {};
      const roleName = (newD.role || oldD.role) === 'admin' ? 'معيد' : (newD.role || oldD.role) === 'super_admin' ? 'مدير نظام' : 'طالب';
      
      const userDiffs = [];
      if (log.action === 'UPDATE') {
        if (oldD.section !== newD.section && (oldD.section || newD.section)) {
          userDiffs.push(`السكشن: (${oldD.section || '—'} ⬅️ ${newD.section || '—'})`);
        }
        if (oldD.year_level !== newD.year_level && (oldD.year_level || newD.year_level)) {
          userDiffs.push(`الفرقة: (${oldD.year_level || '—'} ⬅️ ${newD.year_level || '—'})`);
        }
        if (oldD.name !== newD.name && (oldD.name || newD.name)) {
          userDiffs.push(`تعديل الاسم: (${oldD.name || '—'} ⬅️ ${newD.name || '—'})`);
        }
        if (oldD.role !== newD.role && (oldD.role || newD.role)) {
          userDiffs.push(`تغيير الصلاحية: (${oldD.role || '—'} ⬅️ ${newD.role || '—'})`);
        }
        const oldSubs = Array.isArray(oldD.assigned_subjects) ? oldD.assigned_subjects : [];
        const newSubs = Array.isArray(newD.assigned_subjects) ? newD.assigned_subjects : [];
        if (JSON.stringify(oldSubs) !== JSON.stringify(newSubs)) {
          const readableNew = newSubs.map(entry => {
            if (typeof entry !== 'string') return '';
            const [sid, sec] = entry.split(':');
            return `${subjectsMap[sid] || sid}${sec ? ' (' + sec + ')' : ''}`;
          }).filter(Boolean);
          userDiffs.push(`المقررات: ${readableNew.length > 0 ? readableNew.join(', ') : 'إلغاء تخصيص المواد'}`);
        }
      }

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            <span style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-main)', padding: '2px 7px', borderRadius: '4px', fontSize: '0.78rem' }}>
              👤 المستخدم المعني: {stuName ? `${stuName} (${stuId})` : stuId}
            </span>
            <span style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', padding: '2px 7px', borderRadius: '4px', fontSize: '0.78rem' }}>
              {roleName}
            </span>
            {log.actor_user_id && (
              <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', padding: '2px 7px', borderRadius: '4px', fontSize: '0.75rem' }}>
                ✍️ بواسطة: {log.actor_user_id}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.82rem', color: userDiffs.length > 0 ? '#38bdf8' : 'var(--text-muted)', fontWeight: userDiffs.length > 0 ? 600 : 400 }}>
            {log.action === 'INSERT' 
              ? `➕ إنشاء حساب جديد (${roleName})` 
              : log.action === 'DELETE' 
              ? '🗑️ حذف الحساب نهائياً'
              : userDiffs.length > 0 ? userDiffs.join(' | ') : 'تحديث بيانات الحساب الأكاديمي'}
          </div>
        </div>
      );
    }

    return <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>عملية مسجلة على جدول {getTableLabel(log.table_name)}</div>;
  };

  // Strip sensitive security fields and translate cryptic course UUIDs before displaying
  const cleanDataForDisplay = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const copy = { ...obj };
    delete copy.password;
    delete copy.encrypted_password;
    delete copy.confirmation_token;
    delete copy.recovery_token;

    if (Array.isArray(copy.assigned_subjects)) {
      copy.assigned_subjects = copy.assigned_subjects.map(item => {
        if (typeof item === 'string' && item.includes(':')) {
          const [subId, sec] = item.split(':');
          const friendly = subjectsMap[subId] || subId;
          return `${friendly} (${sec})`;
        } else if (typeof item === 'string' && subjectsMap[item]) {
          return subjectsMap[item];
        }
        return item;
      });
    }

    if (copy.subject_id && subjectsMap[copy.subject_id]) {
      copy.course_name = subjectsMap[copy.subject_id];
    }

    return copy;
  };

  // Group / Cluster logs into single session batches
  const groupAuditLogs = (logsList) => {
    if (!logsList || logsList.length === 0) return [];

    const groups = [];
    let currentGroup = null;

    logsList.forEach((log) => {
      const data = log.new_data || log.old_data || {};
      const subId = data.subject_id || '';
      const week = data.week_number || '';
      const logTime = new Date(log.created_at).getTime();

      // Check if this log matches currentGroup:
      const canGroup = currentGroup &&
        currentGroup.actor_user_id === log.actor_user_id &&
        currentGroup.table_name === log.table_name &&
        currentGroup.action === log.action &&
        currentGroup.subject_id === subId &&
        currentGroup.week === week &&
        Math.abs(currentGroup.lastTime - logTime) <= 120000; // within 2 minutes of the batch

      if (canGroup) {
        currentGroup.items.push(log);
        currentGroup.lastTime = logTime;
        if (log.table_name === 'attendance') {
          const st = log.new_data?.status;
          if (st) currentGroup.statusCounts[st] = (currentGroup.statusCounts[st] || 0) + 1;
        }
      } else {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        const initialCounts = {};
        if (log.table_name === 'attendance') {
          const st = log.new_data?.status;
          if (st) initialCounts[st] = 1;
        }
        currentGroup = {
          id: 'group_' + log.id,
          primaryLog: log,
          created_at: log.created_at,
          actor_user_id: log.actor_user_id,
          table_name: log.table_name,
          action: log.action,
          subject_id: subId,
          week: week,
          startTime: logTime,
          lastTime: logTime,
          statusCounts: initialCounts,
          items: [log]
        };
      }
    });

    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  };

  // Filter logs by search term, year level, and subject
  const filteredLogs = logs.filter(l => {
    const data = l.new_data || l.old_data || {};
    const stuId = data.student_id || data.user_id || l.record_id || '';
    
    // Cohort / Year filter
    if (yearFilter !== 'all') {
      const studentYear = studentsYearMap[stuId] || data.year_level;
      if (String(studentYear) !== String(yearFilter)) return false;
    }

    // Subject filter
    if (subjectFilter !== 'all') {
      const subId = data.subject_id;
      if (subId !== subjectFilter) return false;
    }

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase().trim();
    const actor = (l.actor_user_id || '').toLowerCase();
    const table = (l.table_name || '').toLowerCase();
    const recId = (l.record_id || '').toLowerCase();
    const stuName = (studentsMap[stuId] || '').toLowerCase();
    const subName = (subjectsMap[data.subject_id] || '').toLowerCase();

    return actor.includes(term) || table.includes(term) || recId.includes(term) || String(stuId).toLowerCase().includes(term) || stuName.includes(term) || subName.includes(term);
  });

  const groupedLogs = groupAuditLogs(filteredLogs);

  return (
    <div className="fade-in" style={{ paddingBottom: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <History color="var(--primary-hover)" size={28} />
            سجل الرقابة وتتبع التغييرات (Audit Trail)
          </h2>
          <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-muted)' }}>
            سجل دقيق ومحمي ضد الحذف يسجل بالثانية أي تعديل على الدرجات، الغياب، والبيانات ومن قام به مع تجميع الجلسات تلقائياً.
          </p>
        </div>

        <button 
          onClick={fetchAuditLogs}
          disabled={loading}
          className="btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '0.9rem' }}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          {loading ? 'جاري التحديث...' : 'تحديث السجل'}
        </button>
      </div>

      {/* Security & Permissions Reassurance Banner */}
      <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', color: 'var(--text-main)', padding: '12px 16px', borderRadius: '10px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <ShieldAlert size={22} color="#60a5fa" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '0.88rem', lineHeight: 1.6 }}>
          <strong>🔒 تنبيه الأمان والصلاحيات:</strong> حسابات الطلاب لا تمتلك أي صلاحية لتعديل البيانات في النظام مطلقاً. أي سجل يظهر هنا تم تنفيذه حصرياً بواسطة المعيد أو مدير النظام، واسم الطالب يظهر فقط كطرف متأثّر بالتعديل (مثل رصد غياب أو تعديل درجات).
        </div>
      </div>

      {/* Error alert if table not ready */}
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '14px 18px', borderRadius: '10px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertTriangle size={20} />
          <div>
            <strong>تنبيه:</strong> {error}
          </div>
        </div>
      )}

      {/* Control Bar: Search & Rich Filters */}
      <div className="panel" style={{ padding: '1.2rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 240px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={18} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text"
              placeholder="ابحث برقم الطالب / الاسم / المادة / المعيد..."
              className="input-field"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', paddingRight: '40px', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          
          {/* View Mode Switcher: Grouped vs Detailed */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>طريقة العرض:</span>
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <button
                onClick={() => setViewMode('grouped')}
                style={{
                  background: viewMode === 'grouped' ? 'var(--primary-hover)' : 'transparent',
                  color: viewMode === 'grouped' ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  fontWeight: viewMode === 'grouped' ? 700 : 500,
                  display: 'flex', alignItems: 'center', gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Layers size={14} /> عرض مجمّع (منظم)
              </button>
              <button
                onClick={() => setViewMode('flat')}
                style={{
                  background: viewMode === 'flat' ? 'var(--primary-hover)' : 'transparent',
                  color: viewMode === 'flat' ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  fontWeight: viewMode === 'flat' ? 700 : 500,
                  display: 'flex', alignItems: 'center', gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <List size={14} /> عرض مفصل
              </button>
            </div>
          </div>

          {/* Actor / TA Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>المسؤول / المعيد:</span>
            <select 
              value={actorFilter} 
              onChange={e => setActorFilter(e.target.value)}
              className="input-field"
              style={{ padding: '6px 10px', fontSize: '0.85rem' }}
            >
              <option value="all">جميع المنفّذين والمعيدين</option>
              {actorsList.map(act => {
                const uid = typeof act === 'object' ? act.user_id : act;
                const uName = typeof act === 'object' ? act.name : (studentsMap[act] || act);
                return (
                  <option key={uid} value={uid}>
                    {uName} ({uid})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Table / Section Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>القسم:</span>
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              {[
                { id: 'all', label: 'الكل' },
                { id: 'attendance', label: 'كشف الغياب' },
                { id: 'grades', label: 'رصد الدرجات' },
                { id: 'users', label: 'المستخدمين' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setTableFilter(f.id)}
                  style={{
                    background: tableFilter === f.id ? 'var(--primary-hover)' : 'transparent',
                    color: tableFilter === f.id ? '#ffffff' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    fontWeight: tableFilter === f.id ? 700 : 500,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>العملية:</span>
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              {[
                { id: 'all', label: 'الكل' },
                { id: 'UPDATE', label: 'تعديل' },
                { id: 'INSERT', label: 'إضافة' },
                { id: 'DELETE', label: 'حذف' }
              ].map(a => (
                <button
                  key={a.id}
                  onClick={() => setActionFilter(a.id)}
                  style={{
                    background: actionFilter === a.id ? 'var(--primary-hover)' : 'transparent',
                    color: actionFilter === a.id ? '#ffffff' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    fontWeight: actionFilter === a.id ? 700 : 500,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cohort / Year Level Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>الفرقة:</span>
            <select
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value)}
              className="input-field"
              style={{ padding: '6px 10px', fontSize: '0.85rem' }}
            >
              <option value="all">جميع الفرق</option>
              <option value="1">الفرقة الأولى (1)</option>
              <option value="2">الفرقة الثانية (2)</option>
              <option value="3">الفرقة الثالثة (3)</option>
              <option value="4">الفرقة الرابعة (4)</option>
            </select>
          </div>

          {/* Subject Filter */}
          {subjectsList.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>المادة:</span>
              <select
                value={subjectFilter}
                onChange={e => setSubjectFilter(e.target.value)}
                className="input-field"
                style={{ padding: '6px 10px', fontSize: '0.85rem', maxWidth: '180px' }}
              >
                <option value="all">جميع المواد</option>
                {subjectsList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

        </div>
      </div>

      {/* Audit Log Table */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={28} className="spin" style={{ margin: '0 auto 10px auto' }} />
            <div>جاري تحميل السجل ومطابقة بيانات الطلاب والمواد...</div>
          </div>
        ) : (viewMode === 'grouped' ? groupedLogs.length === 0 : filteredLogs.length === 0) ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <History size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.3 }} />
            <h3 style={{ margin: '0 0 6px 0', color: 'var(--text-main)' }}>لا توجد عمليات مطابقة</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              {searchTerm || tableFilter !== 'all' || actionFilter !== 'all' || actorFilter !== 'all' 
                ? 'جرب تغيير معايير البحث أو الفلاتر لعرض نتائج أخرى.'
                : 'سيتم تسجيل أي عملية تعديل على الدرجات أو رصد الغياب فور حدوثها في هذا السجل تلقائياً.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>الوقت والتاريخ</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>منفّذ العملية</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>نوع العملية</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>القسم</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>التفاصيل الأكاديمية</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>معاينة</th>
                </tr>
              </thead>
              <tbody>
                {viewMode === 'grouped' ? (
                  groupedLogs.map((group) => {
                    const isSingle = group.items.length === 1;
                    const log = group.primaryLog;
                    const dateStr = new Date(group.created_at).toLocaleString('ar-EG', {
                      dateStyle: 'short',
                      timeStyle: 'medium'
                    });
                    const subName = subjectsMap[group.subject_id] || '';
                    const week = group.week ? `أسبوع ${group.week}` : '';

                    return (
                      <tr 
                        key={group.id} 
                        style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: 'var(--text-muted)', direction: 'ltr', textAlign: 'right' }}>
                          <Clock size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '6px' }} />
                          {dateStr}
                        </td>

                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--primary-hover)' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <User size={15} />
                            <span>{group.actor_user_id || 'مدير النظام'}</span>
                          </div>
                        </td>

                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          {getActionBadge(group.action)}
                        </td>

                        <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                          {getTableLabel(group.table_name)}
                        </td>

                        <td style={{ padding: '14px 16px', color: 'var(--text-main)', maxWidth: '520px', lineHeight: 1.5 }}>
                          {isSingle ? (
                            renderLogDetails(log)
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                {subName && (
                                  <span style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', padding: '2px 7px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700 }}>
                                    📚 {subName}
                                  </span>
                                )}
                                {week && (
                                  <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '2px 7px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700 }}>
                                    🗓️ {week}
                                  </span>
                                )}
                                <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700 }}>
                                  👥 عملية رصد جماعية ({group.items.length} طالب)
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', marginTop: '2px', flexWrap: 'wrap' }}>
                                {group.statusCounts.present > 0 && (
                                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                                    ✓ حاضر: {group.statusCounts.present}
                                  </span>
                                )}
                                {group.statusCounts.absent > 0 && (
                                  <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                                    ✗ غائب: {group.statusCounts.absent}
                                  </span>
                                )}
                                {group.statusCounts.late > 0 && (
                                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                                    ⏳ تأخير: {group.statusCounts.late}
                                  </span>
                                )}
                                {group.statusCounts.excused > 0 && (
                                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>
                                    📄 عذر: {group.statusCounts.excused}
                                  </span>
                                )}
                                {group.table_name === 'grades' && (
                                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                                    📊 رصد وتعديل درجات {group.items.length} طالب
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          {isSingle ? (
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Eye size={14} /> التفاصيل
                            </button>
                          ) : (
                            <button
                              onClick={() => setSelectedGroupModal(group)}
                              className="btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '5px', borderColor: 'rgba(79, 70, 229, 0.4)', color: 'var(--primary-hover)', fontWeight: 700 }}
                            >
                              <Eye size={14} /> كل التغييرات ({group.items.length})
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  filteredLogs.map((log) => {
                    const dateStr = new Date(log.created_at).toLocaleString('ar-EG', {
                      dateStyle: 'short',
                      timeStyle: 'medium'
                    });

                    return (
                      <tr 
                        key={log.id} 
                        style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: 'var(--text-muted)', direction: 'ltr', textAlign: 'right' }}>
                          <Clock size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '6px' }} />
                          {dateStr}
                        </td>

                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--primary-hover)' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <User size={15} />
                            <span>{log.actor_user_id || 'مدير النظام'}</span>
                          </div>
                        </td>

                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          {getActionBadge(log.action)}
                        </td>

                        <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                          {getTableLabel(log.table_name)}
                        </td>

                        <td style={{ padding: '14px 16px', color: 'var(--text-main)', maxWidth: '520px', lineHeight: 1.5 }}>
                          {renderLogDetails(log)}
                        </td>

                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Eye size={14} /> التفاصيل
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Grouped Session Detail Modal */}
      {selectedGroupModal && (
        <div 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedGroupModal(null); }}
        >
          <div className="panel fade-in" style={{ maxWidth: '850px', width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: '1.8rem', position: 'relative', border: '1px solid rgba(79, 70, 229, 0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '1.2rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', fontSize: '1.25rem' }}>
                <History color="var(--primary-hover)" size={22} />
                <span>تفاصيل جلسة التغييرات للمعيد ({selectedGroupModal.items.length} طالب)</span>
              </h3>
              <button onClick={() => setSelectedGroupModal(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
            </div>

            {/* Session Info Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '1.2rem', fontSize: '0.88rem', background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div><strong>منفّذ العملية:</strong> <span style={{ color: 'var(--primary-hover)', fontWeight: 700 }}>{selectedGroupModal.actor_user_id || 'مدير النظام'}</span></div>
              <div><strong>القسم:</strong> {getTableLabel(selectedGroupModal.table_name)}</div>
              <div><strong>نوع العملية:</strong> {getActionBadge(selectedGroupModal.action)}</div>
              <div><strong>المادة:</strong> <span style={{ fontWeight: 700 }}>{subjectsMap[selectedGroupModal.subject_id] || selectedGroupModal.subject_id || '—'}</span></div>
              {selectedGroupModal.week && <div><strong>الأسبوع:</strong> أسبوع {selectedGroupModal.week}</div>}
              <div><strong>توقيت الجلسة:</strong> <span style={{ direction: 'ltr', display: 'inline-block' }}>{new Date(selectedGroupModal.created_at).toLocaleString('ar-EG')}</span></div>
            </div>

            {/* Students Table in this Session */}
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 14px', width: '40px' }}>م</th>
                    <th style={{ padding: '10px 14px' }}>الرقم الأكاديمي</th>
                    <th style={{ padding: '10px 14px' }}>اسم الطالب</th>
                    <th style={{ padding: '10px 14px' }}>التفاصيل والتغيير المسجل</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>الوقت الدقيق</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', width: '70px' }}>معاينة</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedGroupModal.items.map((item, idx) => {
                    const d = item.new_data || item.old_data || {};
                    const sId = d.student_id || d.user_id || item.record_id || '';
                    const sName = studentsMap[sId] || '';
                    const itemTime = new Date(item.created_at).toLocaleTimeString('ar-EG');

                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontFamily: 'monospace' }}>{sId}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{sName || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {renderLogDetails(item)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', direction: 'ltr', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                          {itemTime}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <button
                            onClick={() => setSelectedLog(item)}
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            <Eye size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Log Detail Modal (Zero Password Leakage) */}
      {selectedLog && (
        <div 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedLog(null); }}
        >
          <div className="panel fade-in" style={{ maxWidth: '650px', width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '1.8rem', position: 'relative' }}>
            <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <span>🔍 تفاصيل العملية المسجلة</span>
              <button onClick={() => setSelectedLog(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '1.2rem', fontSize: '0.88rem', background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div><strong>منفّذ العملية:</strong> <span style={{ color: 'var(--primary-hover)', fontWeight: 700 }}>{selectedLog.actor_user_id || 'مدير النظام'}</span></div>
              <div><strong>نوع العملية:</strong> {getActionBadge(selectedLog.action)}</div>
              <div><strong>القسم:</strong> {getTableLabel(selectedLog.table_name)}</div>
              <div><strong>الوقت:</strong> <span style={{ direction: 'ltr', display: 'inline-block' }}>{new Date(selectedLog.created_at).toLocaleString('ar-EG')}</span></div>
            </div>

            {/* Human Readable Summary */}
            <div style={{ background: 'rgba(79, 70, 229, 0.08)', border: '1px solid rgba(79, 70, 229, 0.25)', padding: '12px 16px', borderRadius: '8px', marginBottom: '1.2rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--primary-hover)', marginBottom: '4px' }}>
                📋 ملخص التغييرات:
              </div>
              <div>
                {renderLogDetails(selectedLog)}
              </div>
            </div>

            {/* Collapsible Technical Inspection */}
            <details style={{ marginTop: '1rem', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                ⚙️ المعاينة الفنية المتقدمة (JSON مطهّر وخالي من كلمات المرور)
              </summary>
              <div style={{ marginTop: '12px' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: '#f87171' }}>البيانات قبل التعديل:</h4>
                  <pre style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', fontSize: '0.78rem', overflowX: 'auto', direction: 'ltr', color: '#94a3b8' }}>
                    {JSON.stringify(cleanDataForDisplay(selectedLog.old_data), null, 2) || 'لا توجد بيانات سابقة (سجل جديد)'}
                  </pre>
                </div>
                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: '#34d399' }}>البيانات بعد التعديل:</h4>
                  <pre style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', fontSize: '0.78rem', overflowX: 'auto', direction: 'ltr', color: '#94a3b8' }}>
                    {JSON.stringify(cleanDataForDisplay(selectedLog.new_data), null, 2) || 'تم حذف السجل'}
                  </pre>
                </div>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
