import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { cacheManager } from '../../utils/dataCache';
import { printStudentReportPDF } from '../../utils/pdfHelper';
import { Search, Printer, Calendar, BookOpen, FileText, CheckCircle2, XCircle, X, ChevronDown, ChevronUp, Sliders, CheckSquare, Square, RefreshCw } from 'lucide-react';

export default function StudentReportTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [allStudents, setAllStudents] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentAttendance, setStudentAttendance] = useState([]);
  const [studentGrades, setStudentGrades] = useState([]);
  const [selectedYearFilter, setSelectedYearFilter] = useState('all');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  // PDF Export Modal State
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfOptions, setPdfOptions] = useState({
    includeAttendanceDetails: true,
    includeGrades: true,
    includeQuizzes: true,
    includeProject: true,
    includeAttendanceScore: true,
    includeTotal: true,
    selectedSubjectIds: []
  });

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

  const getStudentSubSection = (student, subId) => {
    if (student && Array.isArray(student.assigned_subjects)) {
      const match = student.assigned_subjects.find(entry => typeof entry === 'string' && entry.startsWith(subId + ':'));
      if (match) return normalizeSection(match.split(':')[1]);
    }
    return normalizeSection(student?.section || 'S1');
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);

      const isSuper = !user || user.user_id === 'admin';

      if (forceRefresh) {
        cacheManager.invalidate('admin_users_base');
        cacheManager.invalidate('admin_subjects_base');
      }

      let allUsersList = cacheManager.get('admin_users_base');
      let allSubList = cacheManager.get('admin_subjects_base');

      if (!allUsersList || !allSubList || forceRefresh) {
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
        accessibleSubjects = allSubList.filter(s => 
          s.instructor_id === user.user_id || 
          s.instructor_name === user.name || 
          (user.name && s.instructor_name && s.instructor_name.trim().toLowerCase() === user.name.trim().toLowerCase()) ||
          assignedSubIds.includes(s.id)
        );
      }

      setAllSubjects(accessibleSubjects);
      const studentsOnly = allUsersList.filter(u => u.role === 'student');
      setAllStudents(studentsOnly);

      if (studentsOnly.length > 0) {
        const target = selectedStudent ? studentsOnly.find(s => s.user_id === selectedStudent.user_id) || studentsOnly[0] : studentsOnly[0];
        handleSelectStudent(target, forceRefresh);
      }
    } catch (err) {
      console.error('Fetch report initial data error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSelectStudent = async (stu, forceFetch = false) => {
    setSelectedStudent(stu);
    const cacheKey = 'rep_' + stu.user_id;
    if (!forceFetch) {
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        setStudentAttendance(cached.attendance);
        setStudentGrades(cached.grades);
        return;
      }
    }

    try {
      const [attRes, grdRes] = await Promise.all([
        supabase.from('attendance').select('student_id, subject_id, week_number, status, session_date, excuse_reason').eq('student_id', stu.user_id),
        supabase.from('grades').select('student_id, subject_id, quiz_1, quiz_2, project, attendance_score, final_grade').eq('student_id', stu.user_id)
      ]);

      const attData = attRes.data || [];
      const grdData = grdRes.data || [];

      setStudentAttendance(attData);
      setStudentGrades(grdData);
      cacheManager.set(cacheKey, { attendance: attData, grades: grdData });
    } catch (err) {
      console.error('Fetch student report error:', err);
    }
  };

  const filteredStudents = allStudents.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.user_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchYear = selectedYearFilter === 'all' || normalizeYear(s.year_level) === selectedYearFilter;
    const matchSection = selectedSectionFilter === 'all' || normalizeSection(s.section || 'S1') === normalizeSection(selectedSectionFilter);
    return matchSearch && matchYear && matchSection;
  });

  const enrolledSubjects = allSubjects.filter(sub => {
    if (!selectedStudent) return false;
    if (Array.isArray(sub.enrolled_students)) {
      return sub.enrolled_students.includes(selectedStudent.user_id);
    }
    return false;
  });

  const handleOpenPdfModal = () => {
    setPdfOptions({
      includeAttendanceDetails: true,
      includeGrades: true,
      includeQuizzes: true,
      includeProject: true,
      includeAttendanceScore: true,
      includeTotal: true,
      selectedSubjectIds: enrolledSubjects.map(s => s.id)
    });
    setShowPdfModal(true);
  };

  const handleGeneratePdf = () => {
    setShowPdfModal(false);
    printStudentReportPDF({
      student: selectedStudent,
      subjects: enrolledSubjects,
      grades: studentGrades,
      attendance: studentAttendance,
      options: pdfOptions
    });
  };

  const togglePdfSubject = (subId) => {
    setPdfOptions(prev => {
      const exists = prev.selectedSubjectIds.includes(subId);
      return {
        ...prev,
        selectedSubjectIds: exists ? prev.selectedSubjectIds.filter(id => id !== subId) : [...prev.selectedSubjectIds, subId]
      };
    });
  };

  if (loading) {
    return <div style={{padding:'3rem',textAlign:'center',color:'var(--text-muted)'}}>جاري تحميل تقارير الطلاب...</div>;
  }

  return (
    <div className="fade-in">
      {/* Top Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'1rem'}}>
        <div>
          <h2 style={{margin:0,fontSize:'1.6rem',fontWeight:800}}>التقرير الشامل للطالب</h2>
          <p className="text-muted" style={{margin:'5px 0 0 0'}}>استعراض وتصدير السجل الأكاديمي والغياب لكل طالب</p>
        </div>
        <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
          <button 
            className="btn-secondary" 
            onClick={() => fetchInitialData(true)}
            disabled={refreshing}
            style={{padding:'8px 14px',fontSize:'0.85rem',display:'flex',alignItems:'center',gap:'6px'}}
            title="تحديث فوري لبيانات الدرجات والغياب"
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} /> {refreshing ? 'جاري التحديث...' : 'تحديث البيانات'}
          </button>
          {selectedStudent && (
            <button 
              className="btn-secondary" 
              onClick={handleOpenPdfModal} 
              style={{
                color:'var(--success)',
                borderColor:'rgba(16, 185, 129, 0.4)',
                background:'rgba(16, 185, 129, 0.08)',
                padding:'8px 18px',
                fontSize:'0.95rem',
                fontWeight:700,
                display:'flex',
                alignItems:'center',
                gap:'8px'
              }}
            >
              <Printer size={18} /> تصدير تقرير الطالب PDF
            </button>
          )}
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:'1.5rem',alignItems:'flex-start'}}>
        
        {/* LEFT COLUMN: Student Details & Subject Cards */}
        <div>
          {selectedStudent ? (
            <div className="fade-in">
              {/* Student Header Card with Badges */}
              <div className="panel" style={{marginBottom:'1.2rem',padding:'1.2rem 1.6rem',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'1rem'}}>
                <div>
                  <h3 style={{margin:'0 0 6px 0',fontSize:'1.45rem',fontWeight:800,color:'var(--text-main)'}}>
                    {selectedStudent.name}
                  </h3>
                </div>
                <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                  <span className="badge" style={{background:'var(--bg)',border:'1px solid var(--border)',padding:'6px 12px',fontSize:'0.9rem',fontWeight:700}}>
                    {selectedStudent.user_id}
                  </span>
                  <span className="badge" style={{background:'rgba(79, 70, 229, 0.12)',color:'var(--primary-hover)',border:'1px solid rgba(79, 70, 229, 0.25)',padding:'6px 12px',fontSize:'0.9rem',fontWeight:700}}>
                    فرقة الطالب: {normalizeYear(selectedStudent.year_level)}
                  </span>
                  <span className="badge" style={{background:'rgba(16, 185, 129, 0.12)',color:'var(--success)',border:'1px solid rgba(16, 185, 129, 0.25)',padding:'6px 12px',fontSize:'0.9rem',fontWeight:700}}>
                    السكشن الأساسي: {normalizeSection(selectedStudent.section || 'S1')}
                  </span>
                </div>
              </div>

              {/* Enrolled Subjects Cards */}
              <div style={{display:'flex',flexDirection:'column',gap:'1.2rem'}}>
                {enrolledSubjects.map(sub => {
                  const g = studentGrades.find(grd => grd.subject_id === sub.id) || {};
                  const subAtt = studentAttendance.filter(a => a.subject_id === sub.id);
                  const totalAttended = subAtt.filter(a => a.status === 'present' || a.status === 'late').length;
                  const totalAbsent = subAtt.filter(a => a.status === 'absent').length;
                  const totalWeeks = sub.total_weeks || 12;

                  return (
                    <div key={sub.id} className="panel" style={{padding:'1.4rem',position:'relative'}}>
                      
                      {/* Subject Top Row: Title on right, TA on left */}
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.2rem',flexWrap:'wrap',gap:'0.8rem'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
                          <span style={{fontSize:'0.9rem',color:'var(--text-muted)'}}>
                            المعيد: <strong style={{color:'var(--text-main)'}}>{sub.instructor_name || 'المدير الرئيسي'}</strong>
                          </span>
                          <span className="badge" style={{background:'rgba(79, 70, 229, 0.1)',color:'var(--primary-hover)',border:'1px solid rgba(79, 70, 229, 0.25)',fontSize:'0.8rem'}}>
                            فرقة المقرر: {normalizeYear(sub.year_level)}
                          </span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <span className="badge" style={{background:'rgba(16, 185, 129, 0.15)',color:'var(--success)',border:'1px solid rgba(16, 185, 129, 0.3)',fontSize:'0.9rem',fontWeight:800}}>
                            السكشن: {getStudentSubSection(selectedStudent, sub.id)}
                          </span>
                          <h4 style={{margin:0,fontSize:'1.3rem',fontWeight:800,color:'var(--primary-hover)'}}>
                            {sub.name}
                          </h4>
                        </div>
                      </div>

                      {/* 5 Distinct Metric Cards */}
                      <div style={{display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:'10px',marginBottom:'1.2rem'}}>
                        <div className="panel" style={{background:'rgba(79, 70, 229, 0.15)',border:'1px solid rgba(79, 70, 229, 0.3)',borderRadius:'8px',padding:'12px 6px',textAlign:'center'}}>
                          <div style={{fontSize:'0.85rem',color:'var(--primary-hover)',fontWeight:700,marginBottom:'4px'}}>المجموع</div>
                          <div style={{fontWeight:800,fontSize:'1.4rem',color:'var(--primary-hover)'}}>
                            {(g.quiz_1 || 0) + (g.quiz_2 || 0) + (g.project || 0) + (g.attendance_score || 0)}
                          </div>
                        </div>

                        <div className="panel" style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'8px',padding:'12px 6px',textAlign:'center'}}>
                          <div style={{fontSize:'0.85rem',color:'var(--text-muted)',fontWeight:600,marginBottom:'4px'}}>الحضور</div>
                          <div style={{fontWeight:800,fontSize:'1.4rem',color:'var(--success)'}}>{g.attendance_score || 0}</div>
                        </div>

                        <div className="panel" style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'8px',padding:'12px 6px',textAlign:'center'}}>
                          <div style={{fontSize:'0.85rem',color:'var(--text-muted)',fontWeight:600,marginBottom:'4px'}}>المشروع</div>
                          <div style={{fontWeight:800,fontSize:'1.4rem',color:'var(--text-main)'}}>{g.project || 0}</div>
                        </div>

                        <div className="panel" style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'8px',padding:'12px 6px',textAlign:'center'}}>
                          <div style={{fontSize:'0.85rem',color:'var(--text-muted)',fontWeight:600,marginBottom:'4px'}}>كويز 2</div>
                          <div style={{fontWeight:800,fontSize:'1.4rem',color:'var(--text-main)'}}>{g.quiz_2 || 0}</div>
                        </div>

                        <div className="panel" style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'8px',padding:'12px 6px',textAlign:'center'}}>
                          <div style={{fontSize:'0.85rem',color:'var(--text-muted)',fontWeight:600,marginBottom:'4px'}}>كويز 1</div>
                          <div style={{fontWeight:800,fontSize:'1.4rem',color:'var(--text-main)'}}>{g.quiz_1 || 0}</div>
                        </div>
                      </div>

                      {/* Always Visible Detailed Week-by-Week Attendance Pills */}
                      <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'8px',padding:'12px',marginBottom:'1rem'}}>
                        <div style={{fontSize:'0.85rem',fontWeight:700,color:'var(--text-muted)',marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span>📅 تفاصيل حضور الأسابيع:</span>
                          <span style={{fontSize:'0.8rem',fontWeight:'normal'}}>إجمالي المحاضرات: <strong>{totalWeeks}</strong></span>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(75px, 1fr))',gap:'6px'}}>
                          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => {
                            const record = subAtt.find(a => a.week_number === w);
                            let stLabel = 'لم يرصد';
                            let stColor = 'var(--text-muted)';
                            let stBg = 'var(--surface)';
                            let stBorder = 'var(--border)';

                            if (record) {
                              if (record.status === 'present') { stLabel = 'حاضر ✓'; stColor = 'var(--success)'; stBg = 'rgba(16, 185, 129, 0.1)'; stBorder = 'rgba(16, 185, 129, 0.25)'; }
                              else if (record.status === 'absent') { stLabel = 'غائب ✗'; stColor = 'var(--danger)'; stBg = 'rgba(239, 68, 68, 0.1)'; stBorder = 'rgba(239, 68, 68, 0.25)'; }
                              else if (record.status === 'late') { stLabel = 'تأخير'; stColor = 'var(--warning)'; stBg = 'rgba(245, 158, 11, 0.1)'; stBorder = 'rgba(245, 158, 11, 0.25)'; }
                              else if (record.status === 'excused') { stLabel = 'عذر'; stColor = '#3b82f6'; stBg = 'rgba(59, 130, 246, 0.1)'; stBorder = 'rgba(59, 130, 246, 0.25)'; }
                            }

                            return (
                              <div key={w} style={{background: stBg, border: '1px solid ' + stBorder, borderRadius: '6px', padding: '6px 4px', textAlign: 'center'}} title={record?.excuse_reason ? ('سبب العذر: ' + record.excuse_reason) : ''}>
                                <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>أسبوع {w}</div>
                                <div style={{fontWeight: 'bold', color: stColor, fontSize: '0.8rem', marginTop: '2px'}}>{stLabel}</div>
                                {record?.session_date && <div style={{fontSize:'0.65rem',color:'var(--text-muted)',marginTop:'2px'}}>{record.session_date.slice(5)}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Bottom Footer: Stats */}
                      <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:'20px',fontSize:'0.9rem',color:'var(--text-muted)',borderTop:'1px solid rgba(255,255,255,0.05)',paddingTop:'8px'}}>
                        <span>حضور: <strong style={{color:'var(--success)'}}>{totalAttended}</strong></span>
                        <span>غياب: <strong style={{color:'var(--danger)'}}>{totalAbsent}</strong></span>
                      </div>

                    </div>
                  );
                })}

                {enrolledSubjects.length === 0 && (
                  <div className="panel" style={{textAlign:'center',padding:'3rem',color:'var(--text-muted)'}}>
                    <BookOpen size={40} style={{marginBottom:'1rem',opacity:0.5}} />
                    <p style={{margin:0}}>لا توجد مواد مسجلة لهذا الطالب حالياً</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="panel" style={{textAlign:'center',padding:'4rem',color:'var(--text-muted)'}}>
              <BookOpen size={48} style={{marginBottom:'1rem',opacity:0.5}} />
              <h3>اختر طالباً من القائمة لعرض تقريره الأكاديمي الشامل</h3>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Search + Filters + Student Cards List */}
        <div className="panel" style={{padding:'1rem'}}>
          
          {/* Search Input */}
          <div style={{position:'relative',marginBottom:'12px'}}>
            <Search size={18} style={{position:'absolute',right:'12px',top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}} />
            <input 
              type="text" 
              className="input-field" 
              placeholder="بحث بالاسم أو الرقم..." 
              value={searchTerm} 
              onChange={e=>setSearchTerm(e.target.value)} 
              style={{paddingRight:'38px',fontSize:'0.9rem'}} 
            />
          </div>

          {/* Filters Bar: Year & Section */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'12px'}}>
            <select className="input-field" value={selectedYearFilter} onChange={e=>setSelectedYearFilter(e.target.value)} style={{padding:'6px 8px',fontSize:'0.85rem'}}>
              <option value="all">كل الفرق</option>
              <option value="1">الفرقة 1</option>
              <option value="2">الفرقة 2</option>
              <option value="3">الفرقة 3</option>
              <option value="4">الفرقة 4</option>
            </select>
            <select className="input-field" value={selectedSectionFilter} onChange={e=>setSelectedSectionFilter(e.target.value)} style={{padding:'6px 8px',fontSize:'0.85rem'}}>
              <option value="all">كل السكاشن</option>
              <option value="S1">S1</option>
              <option value="S2">S2</option>
              <option value="S3">S3</option>
              <option value="S4">S4</option>
              <option value="S5">S5</option>
              <option value="S6">S6</option>
            </select>
          </div>

          {/* Student Cards List */}
          <div style={{maxHeight:'650px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'8px'}}>
            {filteredStudents.map(s => {
              const isSelected = selectedStudent?.id === s.id;
              return (
                <div 
                  key={s.id} 
                  onClick={()=>handleSelectStudent(s, true)} 
                  style={{
                    padding:'12px 14px',
                    borderRadius:'8px',
                    cursor:'pointer',
                    transition:'all 0.15s ease',
                    background: isSelected ? 'rgba(79, 70, 229, 0.15)' : 'var(--bg)',
                    border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                    display:'flex',
                    justifyContent:'space-between',
                    alignItems:'center'
                  }}
                >
                  <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                    <span className="badge" style={{background:'rgba(16, 185, 129, 0.1)',color:'var(--success)',border:'1px solid rgba(16, 185, 129, 0.2)',fontSize:'0.8rem',padding:'3px 6px',fontWeight:700}}>
                      {normalizeSection(s.section || 'S1')}
                    </span>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontWeight:700,fontSize:'0.95rem',color: isSelected ? 'var(--primary-hover)' : 'var(--text-main)',lineHeight:'1.3'}}>
                        {s.name}
                      </div>
                    </div>
                  </div>
                  <div style={{fontSize:'0.8rem',color:'var(--text-muted)',fontFamily:'monospace'}}>
                    {s.user_id}
                  </div>
                </div>
              );
            })}
            {filteredStudents.length === 0 && (
              <div style={{textAlign:'center',padding:'2rem',color:'var(--text-muted)',fontSize:'0.9rem'}}>
                لا يوجد طلاب يطابقون البحث
              </div>
            )}
          </div>

        </div>

      </div>

      {/* PDF EXPORT OPTIONS MODAL */}
      {showPdfModal && selectedStudent && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem'
        }}>
          <div className="panel fade-in" style={{maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.2rem',borderBottom:'1px solid var(--border)',paddingBottom:'0.8rem'}}>
              <h3 style={{margin:0,fontSize:'1.25rem',display:'flex',alignItems:'center',gap:'8px'}}>
                <Printer size={20} style={{color:'var(--primary-hover)'}} /> خيارات تصدير تقرير الطالب PDF
              </h3>
              <button onClick={() => setShowPdfModal(false)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>
                <X size={22} />
              </button>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:'1.2rem'}}>
              <div>
                <label style={{display:'block',marginBottom:'8px',fontWeight:700,fontSize:'0.95rem',color:'var(--primary-hover)'}}>
                  1. تحديد محتويات التقرير:
                </label>
                <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'8px',padding:'12px',display:'flex',flexDirection:'column',gap:'8px'}}>
                  
                  <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.9rem',cursor:'pointer'}}>
                    <input 
                      type="checkbox" 
                      checked={pdfOptions.includeAttendanceDetails} 
                      onChange={e => setPdfOptions(prev => ({ ...prev, includeAttendanceDetails: e.target.checked }))} 
                    />
                    <span>📅 سجل وتفاصيل الغياب الأسبوعي (لكل أسبوع)</span>
                  </label>

                  <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.9rem',cursor:'pointer'}}>
                    <input 
                      type="checkbox" 
                      checked={pdfOptions.includeQuizzes} 
                      onChange={e => setPdfOptions(prev => ({ ...prev, includeQuizzes: e.target.checked }))} 
                    />
                    <span>📝 درجات الكويزات (كويز 1 + كويز 2)</span>
                  </label>

                  <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.9rem',cursor:'pointer'}}>
                    <input 
                      type="checkbox" 
                      checked={pdfOptions.includeProject} 
                      onChange={e => setPdfOptions(prev => ({ ...prev, includeProject: e.target.checked }))} 
                    />
                    <span>💻 درجة المشروع العملي</span>
                  </label>

                  <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.9rem',cursor:'pointer'}}>
                    <input 
                      type="checkbox" 
                      checked={pdfOptions.includeAttendanceScore} 
                      onChange={e => setPdfOptions(prev => ({ ...prev, includeAttendanceScore: e.target.checked }))} 
                    />
                    <span>⭐ درجة الحضور والالتزام</span>
                  </label>

                  <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.9rem',cursor:'pointer'}}>
                    <input 
                      type="checkbox" 
                      checked={pdfOptions.includeTotal} 
                      onChange={e => setPdfOptions(prev => ({ ...prev, includeTotal: e.target.checked }))} 
                    />
                    <span>🏆 المجموع الكلي لأعمال الفصل</span>
                  </label>

                </div>
              </div>

              <div>
                <label style={{display:'block',marginBottom:'8px',fontWeight:700,fontSize:'0.95rem',color:'var(--primary-hover)'}}>
                  2. المواد المضمنة في التقرير:
                </label>
                <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'8px',padding:'12px',maxHeight:'140px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'8px'}}>
                  {enrolledSubjects.map(sub => {
                    const isChecked = pdfOptions.selectedSubjectIds.includes(sub.id);
                    return (
                      <label key={sub.id} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.9rem',cursor:'pointer'}}>
                        <input 
                          type="checkbox" 
                          checked={isChecked} 
                          onChange={() => togglePdfSubject(sub.id)} 
                        />
                        <span>{sub.name} (الفرقة {normalizeYear(sub.year_level)})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{display:'flex',gap:'10px',marginTop:'0.5rem'}}>
                <button 
                  type="button" 
                  className="btn-primary" 
                  onClick={handleGeneratePdf} 
                  disabled={pdfOptions.selectedSubjectIds.length === 0}
                  style={{flex:1,padding:'10px',fontSize:'1rem',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}
                >
                  <Printer size={18} /> بدء الطباعة وتوليد PDF
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowPdfModal(false)}>
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
