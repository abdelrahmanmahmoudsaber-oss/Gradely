import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { cacheManager } from '../../utils/dataCache';
import { Users, BookOpen, Clock, Shield, Sliders, Eye, EyeOff } from 'lucide-react';

export default function OverviewTab({ user }) {
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalAdmins: 0,
    totalSubjects: 0,
    lowAttendanceCount: 0,
    lastUpdate: 'غير متوفر'
  });
  const [loading, setLoading] = useState(true);

  // Student Dashboard Visibility Configuration
  const [visibilitySettings, setVisibilitySettings] = useState({
    showQuiz1: true,
    showQuiz2: true,
    showProject: true,
    showAttendanceScore: true,
    showTotal: true,
    showAttendanceTab: true
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  const isSuper = !user || user.user_id === 'admin';

  useEffect(() => {
    fetchOverviewData();
  }, []);

  const parseVisibilityFromSubjects = (subList) => {
    if (!Array.isArray(subList)) return null;
    for (const sub of subList) {
      if (Array.isArray(sub.excluded_students)) {
        const configEntry = sub.excluded_students.find(item => typeof item === 'string' && item.startsWith('CONFIG:'));
        if (configEntry) {
          try {
            return JSON.parse(configEntry.replace('CONFIG:', ''));
          } catch (e) {}
        }
      }
    }
    return null;
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
        accessibleSubjects = allSubList.filter(s => s.instructor_id === user.user_id || assignedSubIds.includes(s.id));
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

  const handleToggleVisibility = async (key) => {
    if (!isSuper) return;
    const updated = {
      ...visibilitySettings,
      [key]: !visibilitySettings[key]
    };
    setVisibilitySettings(updated);
    setSavingSettings(true);
    setSettingsMessage('');

    try {
      const configStr = 'CONFIG:' + JSON.stringify(updated);
      
      // Fetch latest subjects
      const { data: subData } = await supabase.from('subjects').select('id, excluded_students');
      if (subData && subData.length > 0) {
        for (const sub of subData) {
          const currentExcluded = Array.isArray(sub.excluded_students) ? sub.excluded_students.filter(x => typeof x === 'string' && !x.startsWith('CONFIG:')) : [];
          currentExcluded.push(configStr);
          await supabase.from('subjects').update({ excluded_students: currentExcluded }).eq('id', sub.id);
        }
      }

      cacheManager.invalidate('admin_subjects_base');
      cacheManager.invalidate('student_data_');
      localStorage.setItem('gradely_student_visibility', JSON.stringify(updated));
      setSettingsMessage('✅ تم تحديث إعدادات ظهور البيانات للطلاب فوراً');
      setTimeout(() => setSettingsMessage(''), 3500);
    } catch (err) {
      console.error('Save visibility error:', err);
      setSettingsMessage('❌ فشل حفظ الإعدادات');
    } finally {
      setSavingSettings(false);
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

      {/* SUPER ADMIN: STUDENT DASHBOARD VISIBILITY CONTROLS */}
      {isSuper && (
        <div className="panel fade-in" style={{border:'1px solid var(--primary)',marginBottom:'2rem',padding:'1.5rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.2rem',flexWrap:'wrap',gap:'1rem',borderBottom:'1px solid var(--border)',paddingBottom:'1rem'}}>
            <div>
              <h3 style={{margin:'0 0 4px 0',fontSize:'1.3rem',display:'flex',alignItems:'center',gap:'8px',color:'var(--primary-hover)'}}>
                <Sliders size={22} /> التحكم بظهور درجات وبيانات صفحة الطالب
              </h3>
              <p className="text-muted" style={{margin:0,fontSize:'0.85rem'}}>
                تحكم بضغطة زر في إظهار أو إخفاء أي درجة أو تبويب من لوحة تحكم الطلاب مباشرة:
              </p>
            </div>
            {settingsMessage && (
              <span style={{color: settingsMessage.startsWith('✅') ? 'var(--success)' : 'var(--danger)', fontWeight:'bold', fontSize:'0.9rem'}}>
                {settingsMessage}
              </span>
            )}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:'1rem'}}>
            
            <div 
              onClick={() => handleToggleVisibility('showQuiz1')}
              style={{
                background: visibilitySettings.showQuiz1 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: visibilitySettings.showQuiz1 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius:'8px',padding:'12px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
              }}
            >
              <div>
                <div style={{fontWeight:700,fontSize:'0.95rem',color: visibilitySettings.showQuiz1 ? 'var(--success)' : 'var(--text-muted)'}}>
                  درجة كويز 1
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {visibilitySettings.showQuiz1 ? 'ظاهر للطلاب' : 'مخفي عن الطلاب'}
                </div>
              </div>
              {visibilitySettings.showQuiz1 ? <Eye size={20} style={{color:'var(--success)'}} /> : <EyeOff size={20} style={{color:'var(--danger)'}} />}
            </div>

            <div 
              onClick={() => handleToggleVisibility('showQuiz2')}
              style={{
                background: visibilitySettings.showQuiz2 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: visibilitySettings.showQuiz2 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius:'8px',padding:'12px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
              }}
            >
              <div>
                <div style={{fontWeight:700,fontSize:'0.95rem',color: visibilitySettings.showQuiz2 ? 'var(--success)' : 'var(--text-muted)'}}>
                  درجة كويز 2
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {visibilitySettings.showQuiz2 ? 'ظاهر للطلاب' : 'مخفي عن الطلاب'}
                </div>
              </div>
              {visibilitySettings.showQuiz2 ? <Eye size={20} style={{color:'var(--success)'}} /> : <EyeOff size={20} style={{color:'var(--danger)'}} />}
            </div>

            <div 
              onClick={() => handleToggleVisibility('showProject')}
              style={{
                background: visibilitySettings.showProject ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: visibilitySettings.showProject ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius:'8px',padding:'12px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
              }}
            >
              <div>
                <div style={{fontWeight:700,fontSize:'0.95rem',color: visibilitySettings.showProject ? 'var(--success)' : 'var(--text-muted)'}}>
                  درجة المشروع
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {visibilitySettings.showProject ? 'ظاهر للطلاب' : 'مخفي عن الطلاب'}
                </div>
              </div>
              {visibilitySettings.showProject ? <Eye size={20} style={{color:'var(--success)'}} /> : <EyeOff size={20} style={{color:'var(--danger)'}} />}
            </div>

            <div 
              onClick={() => handleToggleVisibility('showAttendanceScore')}
              style={{
                background: visibilitySettings.showAttendanceScore ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: visibilitySettings.showAttendanceScore ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius:'8px',padding:'12px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
              }}
            >
              <div>
                <div style={{fontWeight:700,fontSize:'0.95rem',color: visibilitySettings.showAttendanceScore ? 'var(--success)' : 'var(--text-muted)'}}>
                  درجة الحضور
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {visibilitySettings.showAttendanceScore ? 'ظاهر للطلاب' : 'مخفي عن الطلاب'}
                </div>
              </div>
              {visibilitySettings.showAttendanceScore ? <Eye size={20} style={{color:'var(--success)'}} /> : <EyeOff size={20} style={{color:'var(--danger)'}} />}
            </div>

            <div 
              onClick={() => handleToggleVisibility('showTotal')}
              style={{
                background: visibilitySettings.showTotal ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: visibilitySettings.showTotal ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius:'8px',padding:'12px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
              }}
            >
              <div>
                <div style={{fontWeight:700,fontSize:'0.95rem',color: visibilitySettings.showTotal ? 'var(--success)' : 'var(--text-muted)'}}>
                  المجموع الكلي
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {visibilitySettings.showTotal ? 'ظاهر للطلاب' : 'مخفي عن الطلاب'}
                </div>
              </div>
              {visibilitySettings.showTotal ? <Eye size={20} style={{color:'var(--success)'}} /> : <EyeOff size={20} style={{color:'var(--danger)'}} />}
            </div>

            <div 
              onClick={() => handleToggleVisibility('showAttendanceTab')}
              style={{
                background: visibilitySettings.showAttendanceTab ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: visibilitySettings.showAttendanceTab ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius:'8px',padding:'12px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s'
              }}
            >
              <div>
                <div style={{fontWeight:700,fontSize:'0.95rem',color: visibilitySettings.showAttendanceTab ? 'var(--success)' : 'var(--text-muted)'}}>
                  سجل الغياب بالأسابيع
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {visibilitySettings.showAttendanceTab ? 'ظاهر للطلاب' : 'مخفي عن الطلاب'}
                </div>
              </div>
              {visibilitySettings.showAttendanceTab ? <Eye size={20} style={{color:'var(--success)'}} /> : <EyeOff size={20} style={{color:'var(--danger)'}} />}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
