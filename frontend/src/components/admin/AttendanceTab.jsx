import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabaseClient';
import { exportExcelFile, parseAttendanceExcelFile, exportAttendanceTemplateExcel, getStudentLectureGroup, matchSheetToSubject } from '../../utils/excelHelper';
import { cacheManager, isSuperUser } from '../../utils/dataCache';
import { 
  Download, Users, UserPlus, UserMinus, UserCheck, CheckSquare, 
  FileText, Filter, Calendar, Save, Search, CheckCircle2, XCircle, 
  Clock, AlertCircle, LayoutGrid, List, RotateCcw, Copy, Check, MessageSquare, X, FileSpreadsheet,
  WifiOff, Wifi, RefreshCw, Printer, Layers
} from 'lucide-react';
import { getSectionInstructorName as resolveSectionTA } from '../../utils/sectionHelper';
import { printWeekAttendancePDF } from '../../utils/pdfHelper';
import { getAdminBaseData, getBackupAttendanceAndGrades } from '../../utils/adminDataHelper';

export const SEMESTER_START_DATE = '2026-10-03';

export const getAcademicWeekFromDate = (targetDate = new Date()) => {
  const start = new Date(SEMESTER_START_DATE);
  const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  start.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffTime = target.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 1;
  const currentWeek = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(currentWeek, 1), 15);
};

export const getWeekDefaultDate = (weekNum) => {
  const start = new Date(SEMESTER_START_DATE);
  const d = new Date(start.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
};

export const getWeekEndDate = (weekNum) => {
  const start = new Date(SEMESTER_START_DATE);
  const d = new Date(start.getTime() + ((weekNum - 1) * 7 + 6) * 24 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
};

export const getTodayDateStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function AttendanceTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [allAdmins, setAllAdmins] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');
  const [attendanceType, setAttendanceType] = useState('section'); // 'section' or 'lecture'
  const [selectedGroup, setSelectedGroup] = useState('all'); // 'all', 'A', 'B', 'C'
  const [allSystemSubjects, setAllSystemSubjects] = useState([]);
  const [week, setWeek] = useState(() => getAcademicWeekFromDate());
  const [sessionDate, setSessionDate] = useState(() => getTodayDateStr());
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [excuseReasons, setExcuseReasons] = useState({});
  const [sectionScores, setSectionScores] = useState({});
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [message, setMessage] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'present' | 'absent' | 'late' | 'excused' | 'unrecorded'
  const [bulkActionConfirm, setBulkActionConfirm] = useState(null);

  // Offline and Sync Handling States
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState('');

  // Custom Export Modal State (.txt / .xlsx)
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('txt'); // 'txt' or 'xlsx'
  const [exportFilter, setExportFilter] = useState('all'); // 'all', 'present', 'absent', 'excused', 'late'
  const [exportExtraStudents, setExportExtraStudents] = useState([]);
  const [extraStudentSearch, setExtraStudentSearch] = useState('');
  const [saveExtraAttendanceToDb, setSaveExtraAttendanceToDb] = useState(true);

  // PDF Export Feedback and Preview States
  const [downloadedPdfInfo, setDownloadedPdfInfo] = useState(null); // { filename, blobUrl, blob }
  const [pdfExportLoading, setPdfExportLoading] = useState(false);
  const [pdfProgressText, setPdfProgressText] = useState('');

  // Excuse Modal
  const [excuseModalStudent, setExcuseModalStudent] = useState(null);
  const [excuseInputText, setExcuseInputText] = useState('');
  
  // Custom enrollment states (Super Admin only)
  const [showManageStudents, setShowManageStudents] = useState(false);

  useEffect(() => {
    if (showManageStudents) {
      setTimeout(() => {
        const el = document.getElementById('manage-students-panel');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }, [showManageStudents]);
  const [enrollMode, setEnrollMode] = useState('multi');
  const [filterYearToAdd, setFilterYearToAdd] = useState('1');
  const [filterSectionToAdd, setFilterSectionToAdd] = useState('all');
  const [selectedStudentToAdd, setSelectedStudentToAdd] = useState('');
  const [selectedStudentsList, setSelectedStudentsList] = useState([]);
  const [pastedIds, setPastedIds] = useState('');

  // Excel Attendance Import State
  const [showImportAttendanceModal, setShowImportAttendanceModal] = useState(false);
  const [importAttendanceFile, setImportAttendanceFile] = useState(null);
  const [importAttendanceStatus, setImportAttendanceStatus] = useState('');
  const [importingAttendance, setImportingAttendance] = useState(false);
  const [importDetectedSheets, setImportDetectedSheets] = useState([]);
  const [importAllSheetsMode, setImportAllSheetsMode] = useState(true);
  const [selectedImportSheetIndex, setSelectedImportSheetIndex] = useState(0);
  const [importDatesConfig, setImportDatesConfig] = useState({});
  const [activeDateConfigSheetIdx, setActiveDateConfigSheetIdx] = useState(0);
  const [activeDateConfigWeek, setActiveDateConfigWeek] = useState(1);

  // ─── Smart Attendance Clone State ───────────────────────────────────────────
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneSourceSubject, setCloneSourceSubject] = useState('');
  const [cloneSourceWeek, setCloneSourceWeek] = useState(1);
  const [cloneSourceType, setCloneSourceType] = useState('lecture'); // 'lecture' | 'section'
  const [clonePreview, setClonePreview] = useState(null); // { matched, onlyInSource, onlyInTarget }
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneDefaultForExtra, setCloneDefaultForExtra] = useState('absent'); // 'absent' | 'present' | 'manual'
  const [cloneManualExtra, setCloneManualExtra] = useState({}); // { [student_id]: 'absent'|'present'|'late' }
  const [cloneApplying, setCloneApplying] = useState(false);

  // Prevent background scrolling and viewport jumping when any modal is open
  useEffect(() => {
    const isModalOpen = Boolean(showExportModal || showImportAttendanceModal || showCloneModal || excuseModalStudent || bulkActionConfirm || pdfExportLoading);
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showExportModal, showImportAttendanceModal, showCloneModal, excuseModalStudent, bulkActionConfirm, pdfExportLoading]);


  const saveSubjectBatchDates = async (subId, dateEntries = []) => {
    if (!subId || !Array.isArray(dateEntries) || dateEntries.length === 0) return;
    const targetSub = (attendanceType === 'lecture' ? allSystemSubjects : subjects).find(s => s.id === subId)
      || (allSystemSubjects || []).find(s => s.id === subId)
      || (subjects || []).find(s => s.id === subId);
    if (!targetSub) return;

    let updated = Array.isArray(targetSub.excluded_students) ? [...targetSub.excluded_students] : [];

    dateEntries.forEach(({ weekNum, dateStr, section, isLecture }) => {
      if (!weekNum || !dateStr) return;
      const isLec = isLecture !== undefined ? isLecture : (attendanceType === 'lecture');
      const datePrefix = (isLec ? 'LEC_DATE_W' : 'WEEK_DATE_W') + weekNum + ':';
      const effectiveSec = section && section !== 'all' ? normalizeSection(section) : null;
      const secPrefix = (!isLec && effectiveSec) ? ('WEEK_DATE_W' + weekNum + '_' + effectiveSec + ':') : null;

      if (secPrefix) {
        updated = updated.filter(e => typeof e === 'string' && !e.startsWith(secPrefix));
        updated.push(secPrefix + dateStr);
        if (!updated.some(e => typeof e === 'string' && e.startsWith(datePrefix))) {
          updated.push(datePrefix + dateStr);
        }
      } else {
        updated = updated.filter(e => typeof e === 'string' && !e.startsWith(datePrefix));
        updated.push(datePrefix + dateStr);
      }
    });

    try {
      await supabase.from('subjects').update({ excluded_students: updated }).eq('id', subId);
      targetSub.excluded_students = updated;
      cacheManager.invalidate('admin_subjects_base');
    } catch (e) {
      console.warn('saveSubjectBatchDates error:', e);
    }
  };

  const saveSubjectWeekDate = async (subId, weekNum, dateStr, targetSection = null) => {
    const sec = targetSection || (attendanceType === 'section' && selectedSection ? selectedSection : null);
    await saveSubjectBatchDates(subId, [{ weekNum, dateStr, section: sec }]);
  };


  const getEffectiveWeekNum = () => (attendanceType === 'lecture' ? 100 + week : week);
  const getDatePrefix = () => (attendanceType === 'lecture' ? 'LEC_DATE_W' + week + ':' : 'WEEK_DATE_W' + week + ':');

  const isSuper = isSuperUser(user);

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

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const monthIndex = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        if (monthIndex >= 0 && monthIndex < 12) {
          return day + ' ' + months[monthIndex];
        }
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
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

  const getExistingDateForWeek = (sub, weekNum, sec = null, isLec = false) => {
    if (!sub || !Array.isArray(sub.excluded_students)) return '';
    if (isLec) {
      const tag = sub.excluded_students.find(t => typeof t === 'string' && t.startsWith(`LEC_DATE_W${weekNum}:`));
      return tag ? tag.replace(`LEC_DATE_W${weekNum}:`, '') : '';
    }
    if (sec && sec !== 'all') {
      const normSec = normalizeSection(sec);
      const secTag = sub.excluded_students.find(t => typeof t === 'string' && t.startsWith(`WEEK_DATE_W${weekNum}_${normSec}:`));
      if (secTag) return secTag.replace(`WEEK_DATE_W${weekNum}_${normSec}:`, '');
    }
    const tag = sub.excluded_students.find(t => typeof t === 'string' && t.startsWith(`WEEK_DATE_W${weekNum}:`));
    return tag ? tag.replace(`WEEK_DATE_W${weekNum}:`, '') : '';
  };

  const extractDetectedSections = (records, targetSubId, studentPool) => {
    const secSet = new Set();
    (records || []).forEach(rec => {
      if (rec.section) {
        secSet.add(normalizeSection(rec.section));
      }
    });
    // If no sections in rec.section, try matching students to pool
    if (secSet.size === 0 && studentPool && studentPool.length > 0) {
      (records || []).forEach(rec => {
        const match = studentPool.find(s => 
          (s.user_id && rec.studentId && String(s.user_id).trim() === String(rec.studentId).trim())
        );
        if (match) {
          const sSec = getStudentSubSection(match, targetSubId);
          if (sSec) secSet.add(normalizeSection(sSec));
        }
      });
    }
    if (secSet.size === 0) {
      return ['S1', 'S2', 'S3', 'S4'];
    }
    return Array.from(secSet).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);

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
      setAllSystemSubjects(allSubList);
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

  const getPendingQueue = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem('gradely_pending_attendance_sync') || '[]');
    } catch {
      return [];
    }
  }, []);

  const queueAttendanceChange = (studentId, subId, effWeek, status) => {
    try {
      const queue = getPendingQueue();
      const filtered = queue.filter(item => !(item.student_id === studentId && item.subject_id === subId && item.week_number === effWeek));
      filtered.push({
        student_id: studentId,
        subject_id: subId,
        week_number: effWeek,
        status: status || 'unrecorded',
        timestamp: Date.now()
      });
      localStorage.setItem('gradely_pending_attendance_sync', JSON.stringify(filtered));
      setPendingSyncCount(filtered.length);
    } catch (e) {
      console.error('Failed to queue offline attendance:', e);
    }
  };

  const syncPendingAttendance = async () => {
    const queue = getPendingQueue();
    if (queue.length === 0) return;
    if (!navigator.onLine) {
      alert('⚠️ لا يمكن المزامنة حالياً لعدم توفر اتصال بالإنترنت.');
      return;
    }

    try {
      setSyncingOffline(true);
      const upsertRows = queue.map(q => ({
        student_id: q.student_id,
        subject_id: q.subject_id,
        week_number: q.week_number,
        status: q.status
      }));

      const { error } = await supabase.from('attendance').upsert(upsertRows, { onConflict: 'student_id,subject_id,week_number' });
      if (error) throw error;

      localStorage.removeItem('gradely_pending_attendance_sync');
      setPendingSyncCount(0);
      setAutoSaveStatus('✅ تمت مزامنة جميع تسجيلات الغياب المعلقة مع السيرفر بنجاح!');
      setTimeout(() => setAutoSaveStatus(''), 4000);
    } catch (err) {
      console.error('Failed to sync offline attendance:', err);
      setAutoSaveStatus('❌ تعذر استكمال المزامنة');
    } finally {
      setSyncingOffline(false);
    }
  };

  useEffect(() => {
    const q = getPendingQueue();
    setPendingSyncCount(q.length);

    const handleOnline = () => {
      setIsOnline(true);
      syncPendingAttendance();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [getPendingQueue]);

  // Auto-flip date to today day by day whenever current week is active
  useEffect(() => {
    const syncTodayDayByDay = () => {
      const isCurr = Number(week) === Number(getAcademicWeekFromDate());
      const currentToday = getTodayDateStr();
      if (isCurr && sessionDate !== currentToday) {
        setSessionDate(currentToday);
      }
    };

    window.addEventListener('focus', syncTodayDayByDay);
    const timer = setInterval(syncTodayDayByDay, 30000); // Check every 30 seconds
    return () => {
      window.removeEventListener('focus', syncTodayDayByDay);
      clearInterval(timer);
    };
  }, [week, sessionDate]);

  useEffect(() => {
    if (selectedSubject) {
      fetchAttendance();
      setSelectedStudentsList([]);
      setPastedIds('');
    }
  }, [selectedSubject, week, attendanceType, selectedSection, selectedGroup]);

  const fetchAttendance = async () => {
    const effWeek = getEffectiveWeekNum();
    const storageKey = 'gradely_local_att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;
    const cacheKey = 'att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;
    setOfflineNotice('');

    // 1. Check in-memory cache
    const isCurrWeek = Number(week) === Number(getAcademicWeekFromDate());
    const todayStr = getTodayDateStr();

    const cached = cacheManager.get(cacheKey);
    if (cached) {
      setAttendanceRecords(cached.records || {});
      setExcuseReasons(cached.excuses || {});
      if (isCurrWeek) {
        setSessionDate(todayStr);
      } else if (cached.date) {
        setSessionDate(cached.date);
      } else {
        setSessionDate(getWeekDefaultDate(week));
      }
      return;
    }

    // 2. Check offline local storage backup
    let localSaved = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) localSaved = JSON.parse(raw);
    } catch (e) {
      console.error(e);
    }

    if (!navigator.onLine) {
      if (localSaved && localSaved.records) {
        setAttendanceRecords(localSaved.records);
        setExcuseReasons(localSaved.excuses || {});
        if (isCurrWeek) {
          setSessionDate(todayStr);
        } else if (localSaved.date) {
          setSessionDate(localSaved.date);
        } else {
          setSessionDate(getWeekDefaultDate(week));
        }
        setOfflineNotice('⚠️ تم تحميل هذا الكشف من النسخة المحفوظة محلياً على هذا الجهاز (وضع عدم الاتصال).');
      } else {
        setAttendanceRecords({});
        setExcuseReasons({});
        setOfflineNotice('⚠️ تعذر تحميل سجل الغياب لعدم توفر إنترنت ولم يسبق فتح هذا السكشن على هذا الجهاز.');
      }
      return;
    }

    try {
      // Fetch attendance records from database
      let fetchedRows = [];
      const { data, error } = await supabase
        .from('attendance')
        .select('student_id, status, created_at')
        .eq('subject_id', selectedSubject)
        .eq('week_number', effWeek);

      if (!error && Array.isArray(data)) {
        fetchedRows = data;
      } else {
        console.warn('Direct attendance fetch notice, attempting backup fallback:', error);
        const { attendance: backupAtt } = await getBackupAttendanceAndGrades();
        if (Array.isArray(backupAtt)) {
          fetchedRows = backupAtt.filter(r => r.subject_id === selectedSubject && Number(r.week_number) === Number(effWeek));
        }
      }

      const recs = {};
      const excuses = {};
      let foundDate = null;

      // Check saved week date in subject config
      const targetSub = (attendanceType === 'lecture' ? allSystemSubjects : subjects).find(s => s.id === selectedSubject);
      if (targetSub && Array.isArray(targetSub.excluded_students)) {
        // 1. Check section-specific date first (if section attendance)
        if (attendanceType === 'section' && selectedSection) {
          const secPrefix = 'WEEK_DATE_W' + week + '_' + normalizeSection(selectedSection) + ':';
          const secEntry = targetSub.excluded_students.find(e => typeof e === 'string' && e.startsWith(secPrefix));
          if (secEntry) {
            foundDate = secEntry.replace(secPrefix, '');
          }
        }
        // 2. Check general week date
        if (!foundDate) {
          const datePrefix = getDatePrefix();
          const dateEntry = targetSub.excluded_students.find(e => typeof e === 'string' && e.startsWith(datePrefix));
          if (dateEntry) {
            foundDate = dateEntry.replace(datePrefix, '');
          }
        }
      }

      // Check if any existing attendance record in DB has a created_at date
      if (!foundDate && fetchedRows && fetchedRows.length > 0) {
        const withCreated = fetchedRows.find(r => r.created_at);
        if (withCreated && withCreated.created_at) {
          foundDate = withCreated.created_at.split('T')[0];
        }
      }

      // For the current academic week, ALWAYS flip to today's date automatically day by day
      if (isCurrWeek) {
        foundDate = todayStr;
      } else if (!foundDate) {
        foundDate = getWeekDefaultDate(week);
      }

      if (fetchedRows && fetchedRows.length > 0) {
        fetchedRows.forEach(r => { 
          recs[r.student_id] = r.status;
        });
      }

      setAttendanceRecords(recs);
      setExcuseReasons(excuses);

      // Load weekly section participation scores from grades table
      if (attendanceType === 'section') {
        try {
          const { data: gData } = await supabase
            .from('grades')
            .select('student_id, custom_grades')
            .eq('subject_id', selectedSubject);

          if (gData && Array.isArray(gData)) {
            const scKey = 'sec_score_w' + week;
            const scMap = {};
            gData.forEach(g => {
              if (g.custom_grades && g.custom_grades[scKey] !== undefined) {
                scMap[g.student_id] = g.custom_grades[scKey];
              }
            });
            setSectionScores(scMap);
          }
        } catch (e) {
          console.warn('Section scores load warning:', e);
        }
      } else {
        setSectionScores({});
      }

      setSessionDate(foundDate);
      setOfflineNotice('');
      cacheManager.set(cacheKey, { records: recs, excuses, date: foundDate });

      // Save local offline copy
      try {
        localStorage.setItem(storageKey, JSON.stringify({ records: recs, excuses, date: foundDate, updatedAt: Date.now() }));
      } catch (e) {}

    } catch (err) {
      console.error('Fetch attendance error:', err);
      if (localSaved && localSaved.records) {
        setAttendanceRecords(localSaved.records);
        setExcuseReasons(localSaved.excuses || {});
        if (localSaved.date) setSessionDate(localSaved.date);
        setOfflineNotice('⚠️ حدث خطأ في الاتصال بالسيرفر، تم تحميل النسخة المحلية المحفوظة على جهازك.');
      } else {
        setAttendanceRecords({});
        setExcuseReasons({});
        setOfflineNotice('⚠️ تعذر الاتصال بالسيرفر لتحميل كشف الغياب.');
      }
    }
  };

  const activeSubjectsPool = attendanceType === 'lecture' ? allSystemSubjects : subjects;
  const displayedSubjects = activeSubjectsPool.filter(s => selectedYear === 'all' || normalizeYear(s.year_level) === selectedYear);

  const handleYearFilterChange = (yr) => {
    setSelectedYear(yr);
    setSelectedGroup('all');
    setSelectedSection('all');
    const pool = attendanceType === 'lecture' ? allSystemSubjects : subjects;
    const valid = pool.filter(s => yr === 'all' || normalizeYear(s.year_level) === yr);
    if (valid.length > 0) { 
      setSelectedSubject(valid[0].id); 
      setFilterYearToAdd(normalizeYear(valid[0].year_level)); 
    } else {
      setSelectedSubject('');
    }
  };

  const handleToggleAttendanceType = (type) => {
    setAttendanceType(type);
    setSelectedGroup('all');
    setSelectedSection('all');
    const pool = type === 'lecture' ? allSystemSubjects : subjects;
    const valid = pool.filter(s => selectedYear === 'all' || normalizeYear(s.year_level) === selectedYear);
    if (!valid.some(s => s.id === selectedSubject)) {
      if (valid.length > 0) {
        setSelectedSubject(valid[0].id);
        setFilterYearToAdd(normalizeYear(valid[0].year_level));
      } else {
        setSelectedSubject('');
      }
    }
  };

  useEffect(() => {
    if (displayedSubjects.length > 0) {
      if (!displayedSubjects.some(s => s.id === selectedSubject)) {
        setSelectedSubject(displayedSubjects[0].id);
        setSelectedGroup('all');
        setSelectedSection('all');
        setFilterYearToAdd(normalizeYear(displayedSubjects[0].year_level));
      }
    } else if (selectedSubject) {
      setSelectedSubject('');
    }
  }, [displayedSubjects, selectedSubject]);

  const currentSub = (attendanceType === 'lecture' ? allSystemSubjects : subjects).find(s => s.id === selectedSubject);

  // Local state override for immediate, zero-latency toggle feedback
  const [localSecPartOverride, setLocalSecPartOverride] = useState({});

  // Per-subject section participation configuration (disabled by default, configurable max)
  const secPartConfig = useMemo(() => {
    if (selectedSubject && localSecPartOverride[selectedSubject] !== undefined) {
      return localSecPartOverride[selectedSubject];
    }
    if (!currentSub || !Array.isArray(currentSub.excluded_students)) {
      return { enabled: false, max: 5 };
    }
    const tag = currentSub.excluded_students.find(e => typeof e === 'string' && e.startsWith('CONFIG_SEC_PART:'));
    if (!tag) return { enabled: false, max: 5 };
    try {
      const parsed = JSON.parse(tag.replace('CONFIG_SEC_PART:', ''));
      return {
        enabled: Boolean(parsed.enabled),
        max: typeof parsed.max === 'number' && parsed.max > 0 ? parsed.max : 5
      };
    } catch (e) {
      return { enabled: false, max: 5 };
    }
  }, [currentSub, selectedSubject, localSecPartOverride]);

  const handleToggleSecPart = async (newEnabled, newMax = null) => {
    if (!selectedSubject) return;
    const targetSub = subjects.find(s => s.id === selectedSubject) || allSystemSubjects.find(s => s.id === selectedSubject);
    if (!targetSub) return;

    const effectiveMax = newMax !== null ? (Math.max(1, Number(newMax)) || 5) : (secPartConfig.max || 5);
    const currentExcluded = Array.isArray(targetSub.excluded_students) ? targetSub.excluded_students : [];
    const filtered = currentExcluded.filter(e => typeof e !== 'string' || !e.startsWith('CONFIG_SEC_PART:'));

    if (newEnabled) {
      filtered.push(`CONFIG_SEC_PART:${JSON.stringify({ enabled: true, max: effectiveMax })}`);
    }

    // 1. Instantly update local override and state for 0ms reactive UI update
    setLocalSecPartOverride(prev => ({ ...prev, [selectedSubject]: { enabled: Boolean(newEnabled), max: effectiveMax } }));
    targetSub.excluded_students = [...filtered];
    setSubjects(prev => prev.map(s => s.id === targetSub.id ? { ...s, excluded_students: [...filtered] } : s));
    setAllSystemSubjects(prev => prev.map(s => s.id === targetSub.id ? { ...s, excluded_students: [...filtered] } : s));
    cacheManager.set('admin_subjects_base', subjects.map(s => s.id === targetSub.id ? { ...s, excluded_students: [...filtered] } : s));

    // 2. Persist to database via RPC or direct update
    try {
      const sessionToken = localStorage.getItem('gradely_session_token') || '';
      const { error: rpcErr } = await supabase.rpc('update_subject_excluded_students', {
        p_subject_id: selectedSubject,
        p_excluded_students: filtered,
        p_session_token: sessionToken
      });

      if (rpcErr) {
        await supabase
          .from('subjects')
          .update({ excluded_students: filtered })
          .eq('id', selectedSubject);
      }
    } catch (err) {
      console.warn('Persistence notice for section participation config:', err);
    }
  };

  const getEnrolledStudents = () => {
    if (!currentSub) return [];
    if (Array.isArray(currentSub.enrolled_students) && currentSub.enrolled_students.length > 0) {
      const matched = allStudents.filter(stu => currentSub.enrolled_students.includes(stu.user_id));
      if (matched.length > 0) return matched;
    }
    // Fallback: match all students in the subject's academic year level
    const subYear = normalizeYear(currentSub.year_level);
    return allStudents.filter(stu => normalizeYear(stu.year_level) === subYear);
  };

  const enrolledStudents = getEnrolledStudents();

  const groupACount = enrolledStudents.filter(stu => getStudentLectureGroup(stu, selectedSubject) === 'A').length;
  const groupBCount = enrolledStudents.filter(stu => getStudentLectureGroup(stu, selectedSubject) === 'B').length;

  const candidatePool = enrolledStudents;

  const baseEnrolledStudents = candidatePool
    .filter(stu => {
      if (attendanceType === 'lecture') {
        if (selectedGroup === 'all') return true;
        const grp = getStudentLectureGroup(stu, selectedSubject);
        return grp === selectedGroup;
      } else {
        if (selectedSection === 'all') return true;
        return getStudentSubSection(stu, selectedSubject) === normalizeSection(selectedSection);
      }
    })
    .filter(stu => {
      if (!studentSearch.trim()) return true;
      const q = studentSearch.toLowerCase().trim();
      return (stu.name && stu.name.toLowerCase().includes(q)) || (stu.user_id && stu.user_id.toLowerCase().includes(q));
    });

  baseEnrolledStudents.sort((a, b) => {
    const secA = (a.section || '').localeCompare(b.section || '');
    if (secA !== 0) return secA;
    return String(a.user_id).localeCompare(String(b.user_id));
  });

  const displayedEnrolledStudents = baseEnrolledStudents.filter(stu => {
    if (statusFilter === 'all') return true;
    const st = attendanceRecords[stu.user_id];
    if (statusFilter === 'recorded') return !!st;
    if (statusFilter === 'present') return st === 'present';
    if (statusFilter === 'absent') return st === 'absent';
    if (statusFilter === 'late') return st === 'late';
    if (statusFilter === 'excused') return st === 'excused';
    if (statusFilter === 'unrecorded') return !st;
    return true;
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

    // If current user is a TA (not super admin), only show their assigned sections for this subject
// Showing all existing sections for full visibility across TAs

    return list;
  };

  const availableSections = getSubjectAvailableSections();

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

  const handleUpdateSectionScore = async (studentId, val) => {
    const maxVal = secPartConfig.max || 5;
    const parsed = val === '' ? null : Math.min(maxVal, Math.max(0, parseFloat(val) || 0));
    setSectionScores(prev => ({ ...prev, [studentId]: parsed }));

    try {
      const { data: existingG } = await supabase
        .from('grades')
        .select('custom_grades')
        .eq('student_id', studentId)
        .eq('subject_id', selectedSubject)
        .maybeSingle();

      const existingCust = (existingG && existingG.custom_grades) || {};
      const updatedCust = {
        ...existingCust,
        ['sec_score_w' + week]: parsed
      };

      await supabase.from('grades').upsert({
        student_id: studentId,
        subject_id: selectedSubject,
        custom_grades: updatedCust
      }, { onConflict: 'student_id,subject_id' });

      setAutoSaveStatus('✓ تم حفظ درجة المشاركة');
      setTimeout(() => setAutoSaveStatus(''), 2000);
    } catch (err) {
      console.warn('Update section score error:', err);
    }
  };

  // Instant 0ms Local Toggle + Non-blocking Background Upsert
  // Instant 0ms Local Toggle + Non-blocking Database Upsert + Offline Storage
  const toggleAttendance = async (studentId, newStatus) => {
    const currentVal = attendanceRecords[studentId];
    const nextVal = currentVal === newStatus ? null : newStatus;
    
    if (nextVal === 'excused') {
      const studentObj = allStudents.find(s => s.user_id === studentId);
      setExcuseModalStudent(studentObj || { user_id: studentId, name: studentId });
      setExcuseInputText(excuseReasons[studentId] || '');
    }

    const updatedRecs = { ...attendanceRecords, [studentId]: nextVal };
    setAttendanceRecords(updatedRecs);

    // Auto default score for section attendance ONLY IF participation grades are enabled for this subject
    if (attendanceType === 'section' && secPartConfig.enabled) {
      const maxScore = secPartConfig.max || 5;
      if (nextVal === 'present' && (sectionScores[studentId] === undefined || sectionScores[studentId] === null)) {
        handleUpdateSectionScore(studentId, maxScore);
      } else if (nextVal === 'absent' && (sectionScores[studentId] === undefined || sectionScores[studentId] === maxScore)) {
        handleUpdateSectionScore(studentId, 0);
      }
    }
    
    const effWeek = getEffectiveWeekNum();
    const storageKey = 'gradely_local_att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;
    const cacheKey = 'att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;

    cacheManager.set(cacheKey, { records: updatedRecs, excuses: excuseReasons, date: sessionDate });
    cacheManager.invalidate('rep_' + studentId);
    cacheManager.invalidate('student_data_' + studentId);

    // Save to persistent localStorage immediately
    try {
      localStorage.setItem(storageKey, JSON.stringify({ records: updatedRecs, excuses: excuseReasons, date: sessionDate, updatedAt: Date.now() }));
    } catch (e) {}

    if (!navigator.onLine) {
      queueAttendanceChange(studentId, selectedSubject, effWeek, nextVal);
      setAutoSaveStatus('🟡 تم الحفظ محلياً على جهازك (Offline)');
      return;
    }

    setAutoSaveStatus('💾 جاري الحفظ...');

    try {
      await saveSubjectWeekDate(selectedSubject, week, sessionDate);

      // Try secure RPC first
      let saveSuccess = false;
      try {
        const { error: rpcErr } = await supabase.rpc('save_attendance_record', {
          p_student_id: studentId,
          p_subject_id: selectedSubject,
          p_week_number: effWeek,
          p_status: nextVal || 'unrecorded',
          p_session_token: localStorage.getItem('gradely_session_token') || null
        });
        if (!rpcErr) saveSuccess = true;
      } catch (_) {}

      // Direct upsert fallback
      if (!saveSuccess) {
        const { error } = await supabase.from('attendance').upsert({
          student_id: studentId,
          subject_id: selectedSubject,
          week_number: effWeek,
          status: nextVal || 'unrecorded'
        }, { onConflict: 'student_id,subject_id,week_number' });
        if (!error) saveSuccess = true;
      }

      if (saveSuccess) {
        setAutoSaveStatus('✓ تم الحفظ تلقائياً');
        setTimeout(() => setAutoSaveStatus(''), 2000);
      } else {
        queueAttendanceChange(studentId, selectedSubject, effWeek, nextVal);
        setAutoSaveStatus('🟡 تم الحفظ محلياً (في انتظار المزامنة)');
      }
    } catch (err) {
      console.error('Attendance toggle error:', err);
      queueAttendanceChange(studentId, selectedSubject, effWeek, nextVal);
      setAutoSaveStatus('🟡 تم الحفظ محلياً (في انتظار المزامنة)');
    }
  };

  // Manual Explicit Save All Attendance Records for this week
  const handleManualSaveAttendance = async () => {
    if (!selectedSubject) return;
    const effWeek = getEffectiveWeekNum();
    const storageKey = 'gradely_local_att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;
    
    // Always persist to localStorage first
    try {
      localStorage.setItem(storageKey, JSON.stringify({ records: attendanceRecords, excuses: excuseReasons, date: sessionDate, updatedAt: Date.now() }));
    } catch (e) {}

    if (!navigator.onLine) {
      baseEnrolledStudents.forEach(stu => {
        queueAttendanceChange(stu.user_id, selectedSubject, effWeek, attendanceRecords[stu.user_id]);
      });
      setAutoSaveStatus('🟡 تم حفظ الكشف محلياً على جهازك (سيتم الرفع عند الاتصال)');
      setTimeout(() => setAutoSaveStatus(''), 4000);
      return;
    }

    setAutoSaveStatus('💾 جاري الحفظ الشامل...');
    try {
      const upsertRows = baseEnrolledStudents.map(stu => ({
        student_id: stu.user_id,
        subject_id: selectedSubject,
        week_number: effWeek,
        status: attendanceRecords[stu.user_id] || 'unrecorded'
      }));

      if (upsertRows.length > 0) {
        await saveSubjectWeekDate(selectedSubject, week, sessionDate);
        const sessionToken = localStorage.getItem('gradely_session_token') || null;
        let bulkSaved = false;
        try {
          const { error: rpcErr } = await supabase.rpc('save_bulk_attendance', {
            p_records: upsertRows,
            p_session_token: sessionToken
          });
          if (!rpcErr) bulkSaved = true;
        } catch (_) {}

        if (!bulkSaved) {
          const { error } = await supabase.from('attendance').upsert(upsertRows, { onConflict: 'student_id,subject_id,week_number' });
          if (error) throw error;
        }
      }

      // Also save week date in subject config
      const targetSub = subjects.find(s => s.id === selectedSubject);
      if (targetSub) {
        const currentExcluded = Array.isArray(targetSub.excluded_students) ? targetSub.excluded_students : [];
        const datePrefix = 'WEEK_DATE_W' + week + ':';
        const kept = currentExcluded.filter(e => typeof e === 'string' && !e.startsWith(datePrefix));
        const updatedExcluded = [...kept, datePrefix + sessionDate];
        await supabase.from('subjects').update({ excluded_students: updatedExcluded }).eq('id', selectedSubject);
        targetSub.excluded_students = updatedExcluded;
        cacheManager.invalidate('admin_subjects_base');
      }

      setAutoSaveStatus('✅ تم حفظ كشف الغياب وتاريخ الأسبوع بنجاح!');
      setTimeout(() => setAutoSaveStatus(''), 3500);
    } catch (err) {
      console.error('Manual save error:', err);
      baseEnrolledStudents.forEach(stu => {
        queueAttendanceChange(stu.user_id, selectedSubject, effWeek, attendanceRecords[stu.user_id]);
      });
      setAutoSaveStatus('🟡 تم الحفظ محلياً على جهازك (تعذر الاتصال بالسيرفر)');
    }
  };

  const handleSaveExcuseReason = () => {
    if (!excuseModalStudent) return;
    const sId = excuseModalStudent.user_id;
    const updatedExcuses = { ...excuseReasons, [sId]: excuseInputText.trim() };
    setExcuseReasons(updatedExcuses);
    cacheManager.set('att_' + selectedSubject + '_w' + week, { records: attendanceRecords, excuses: updatedExcuses, date: sessionDate });
    cacheManager.invalidate('rep_' + sId);
    cacheManager.invalidate('student_data_' + sId);

    supabase.from('attendance').upsert({
      student_id: sId,
      subject_id: selectedSubject,
      week_number: week,
      status: 'excused',
      }, { onConflict: 'student_id,subject_id,week_number' });

    setExcuseModalStudent(null);
    setExcuseInputText('');
  };

  // ─── Smart Attendance Clone: Load Preview ────────────────────────────────────
  const handleLoadClonePreview = async () => {
    if (!cloneSourceSubject || !selectedSubject) return;
    setCloneLoading(true);
    setClonePreview(null);
    setCloneManualExtra({});

    try {
      // Effective week number for source
      const srcEffWeek = cloneSourceType === 'lecture' ? 100 + cloneSourceWeek : cloneSourceWeek;

      // Fetch source attendance records from DB
      const { data: srcData, error: srcErr } = await supabase
        .from('attendance')
        .select('student_id, status')
        .eq('subject_id', cloneSourceSubject)
        .eq('week_number', srcEffWeek);

      if (srcErr) throw srcErr;

      // Build source records map: { student_id -> status }
      const srcRecords = {};
      (srcData || []).forEach(r => { srcRecords[r.student_id] = r.status; });

      // Get enrolled students for target subject (current)
      const targetEnrolledIds = new Set(
        (currentSub?.enrolled_students || [])
      );

      // Get enrolled students for source subject
      const srcSubject = allSystemSubjects.find(s => s.id === cloneSourceSubject);
      const srcEnrolledIds = new Set(srcSubject?.enrolled_students || []);

      // Students in BOTH (will get cloned status)
      const matched = allStudents.filter(s =>
        srcEnrolledIds.has(s.user_id) && targetEnrolledIds.has(s.user_id)
      ).map(s => ({
        ...s,
        srcStatus: srcRecords[s.user_id] || 'unrecorded'
      }));

      // Students ONLY in source (not in target – will be ignored)
      const onlyInSource = allStudents.filter(s =>
        srcEnrolledIds.has(s.user_id) && !targetEnrolledIds.has(s.user_id)
      );

      // Students ONLY in target (not in source – need decision)
      const onlyInTarget = allStudents.filter(s =>
        !srcEnrolledIds.has(s.user_id) && targetEnrolledIds.has(s.user_id)
      );

      setClonePreview({ matched, onlyInSource, onlyInTarget, srcRecords });
    } catch (err) {
      console.error('Clone preview error:', err);
      setMessage('❌ حدث خطأ أثناء تحميل بيانات المادة المصدر. يرجى المحاولة مرة أخرى.');
      setTimeout(() => setMessage(''), 4000);
    } finally {
      setCloneLoading(false);
    }
  };

  // ─── Smart Attendance Clone: Apply ───────────────────────────────────────────
  const handleApplyClone = async () => {
    if (!clonePreview || !selectedSubject) return;
    setCloneApplying(true);

    try {
      const effWeek = getEffectiveWeekNum();
      const newRecords = { ...attendanceRecords };

      // 1. Apply matched students (cloned status from source)
      clonePreview.matched.forEach(stu => {
        const st = stu.srcStatus;
        if (st && st !== 'unrecorded') {
          newRecords[stu.user_id] = st;
        }
      });

      // 2. Apply target-only students based on chosen default
      clonePreview.onlyInTarget.forEach(stu => {
        if (cloneDefaultForExtra === 'manual') {
          const manualSt = cloneManualExtra[stu.user_id];
          if (manualSt) newRecords[stu.user_id] = manualSt;
        } else {
          newRecords[stu.user_id] = cloneDefaultForExtra;
        }
      });

      // Update local state immediately
      setAttendanceRecords(newRecords);

      // Save to DB
      await saveSubjectWeekDate(selectedSubject, week, sessionDate);

      const upsertRows = Object.entries(newRecords)
        .filter(([, status]) => status && status !== 'unrecorded')
        .map(([student_id, status]) => ({
          student_id,
          subject_id: selectedSubject,
          week_number: effWeek,
          status
        }));

      if (upsertRows.length > 0) {
        const chunkSize = 20;
        for (let i = 0; i < upsertRows.length; i += chunkSize) {
          const chunk = upsertRows.slice(i, i + chunkSize);
          await supabase.from('attendance').upsert(chunk, { onConflict: 'student_id,subject_id,week_number' });
        }
      }

      // Update cache
      const cacheKey = 'att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;
      const storageKey = 'gradely_local_att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;
      cacheManager.set(cacheKey, { records: newRecords, excuses: excuseReasons, date: sessionDate });
      try {
        localStorage.setItem(storageKey, JSON.stringify({ records: newRecords, excuses: excuseReasons, date: sessionDate, updatedAt: Date.now() }));
      } catch (e) {}

      const matchedCount = clonePreview.matched.filter(s => s.srcStatus && s.srcStatus !== 'unrecorded').length;
      const extraCount = clonePreview.onlyInTarget.length;
      setMessage(`✅ تم نسخ الحضور بنجاح! تم تطبيق حالة ${matchedCount} طالب مشترك${extraCount > 0 ? ` وتحديد حالة ${extraCount} طالب إضافي` : ''}.`);
      setTimeout(() => setMessage(''), 5000);
      setShowCloneModal(false);
      setClonePreview(null);
    } catch (err) {
      console.error('Clone apply error:', err);
      setMessage('❌ حدث خطأ أثناء تطبيق النسخ. يرجى المحاولة مرة أخرى.');
      setTimeout(() => setMessage(''), 4000);
    } finally {
      setCloneApplying(false);
    }
  };

  const handleMarkAllPresent = async () => {
    const updated = { ...attendanceRecords };
    displayedEnrolledStudents.forEach(stu => {
      updated[stu.user_id] = 'present';
    });
    setAttendanceRecords(updated);
    const effWeek = getEffectiveWeekNum();
    const cacheKey = 'att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;
    const storageKey = 'gradely_local_att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;
    cacheManager.set(cacheKey, { records: updated, excuses: excuseReasons, date: sessionDate });
    try {
      localStorage.setItem(storageKey, JSON.stringify({ records: updated, excuses: excuseReasons, date: sessionDate, updatedAt: Date.now() }));
    } catch (e) {}

    const rows = displayedEnrolledStudents.map(stu => ({
      student_id: stu.user_id,
      subject_id: selectedSubject,
      week_number: effWeek,
      status: 'present',
    }));

    setAutoSaveStatus('✓ تم تحضير الكل وحفظه');
    setTimeout(() => setAutoSaveStatus(''), 2000);

    await saveSubjectWeekDate(selectedSubject, week, sessionDate);
    await supabase.from('attendance').upsert(rows, { onConflict: 'student_id,subject_id,week_number' });
  };

  const handleMarkAllAbsent = async () => {
    const updated = { ...attendanceRecords };
    displayedEnrolledStudents.forEach(stu => {
      updated[stu.user_id] = 'absent';
    });
    setAttendanceRecords(updated);
    const effWeek = getEffectiveWeekNum();
    const cacheKey = 'att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;
    const storageKey = 'gradely_local_att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;
    cacheManager.set(cacheKey, { records: updated, excuses: excuseReasons, date: sessionDate });
    try {
      localStorage.setItem(storageKey, JSON.stringify({ records: updated, excuses: excuseReasons, date: sessionDate, updatedAt: Date.now() }));
    } catch (e) {}

    const rows = displayedEnrolledStudents.map(stu => ({
      student_id: stu.user_id,
      subject_id: selectedSubject,
      week_number: effWeek,
      status: 'absent',
    }));

    setAutoSaveStatus('✓ تم تغييب كافة الطلاب وحفظه');
    setTimeout(() => setAutoSaveStatus(''), 2000);

    await saveSubjectWeekDate(selectedSubject, week, sessionDate);
    await supabase.from('attendance').upsert(rows, { onConflict: 'student_id,subject_id,week_number' });
  };

  const handleResetCurrentAttendance = async () => {
    const updated = { ...attendanceRecords };
    displayedEnrolledStudents.forEach(stu => {
      delete updated[stu.user_id];
    });
    setAttendanceRecords(updated);
    const effWeek = getEffectiveWeekNum();
    const cacheKey = 'att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;
    const storageKey = 'gradely_local_att_' + (attendanceType === 'lecture' ? 'lec_' : 'sec_') + selectedSubject + '_w' + week;
    cacheManager.set(cacheKey, { records: updated, excuses: excuseReasons, date: sessionDate });
    try {
      localStorage.setItem(storageKey, JSON.stringify({ records: updated, excuses: excuseReasons, date: sessionDate, updatedAt: Date.now() }));
    } catch (e) {}

    const rows = displayedEnrolledStudents.map(stu => ({
      student_id: stu.user_id,
      subject_id: selectedSubject,
      week_number: effWeek,
      status: 'unrecorded',
    }));
    setAutoSaveStatus('✓ تمت إعادة ضبط كشف الأسبوع');
    setTimeout(() => setAutoSaveStatus(''), 2000);
    await supabase.from('attendance').upsert(rows, { onConflict: 'student_id,subject_id,week_number' });
  };

  const executeBulkAction = async () => {
    if (!bulkActionConfirm) return;
    const type = bulkActionConfirm.type;
    setBulkActionConfirm(null);
    if (type === 'present') {
      await handleMarkAllPresent();
    } else if (type === 'absent') {
      await handleMarkAllAbsent();
    } else if (type === 'reset') {
      await handleResetCurrentAttendance();
    }
  };

  const handleOpenExportModal = () => {
    setExportExtraStudents([]);
    setExtraStudentSearch('');
    setShowExportModal(true);
  };

  const availableExtraCandidates = allStudents.filter(stu => {
    if (normalizeYear(stu.year_level) !== normalizeYear(currentSub?.year_level)) return false;
    if (baseEnrolledStudents.some(s => String(s.user_id).trim() === String(stu.user_id).trim())) return false;
    if (exportExtraStudents.some(s => String(s.user_id).trim() === String(stu.user_id).trim())) return false;
    if (!extraStudentSearch.trim()) return false;
    const q = extraStudentSearch.toLowerCase().trim();
    return (stu.name && stu.name.toLowerCase().includes(q)) || (stu.user_id && stu.user_id.toLowerCase().includes(q));
  });

  const handleAddExtraStudent = (stu) => {
    const nativeGrp = getStudentLectureGroup(stu, selectedSubject);
    const nativeSec = getStudentSubSection(stu, selectedSubject);
    setExportExtraStudents(prev => [
      ...prev,
      {
        ...stu,
        status: 'present',
        nativeGroup: nativeGrp,
        nativeSection: nativeSec,
        isExtra: true
      }
    ]);
    setExtraStudentSearch('');
  };

  const handleRemoveExtraStudent = (userId) => {
    setExportExtraStudents(prev => prev.filter(s => s.user_id !== userId));
  };

  const handleUpdateExtraStatus = (userId, status) => {
    setExportExtraStudents(prev => prev.map(s => s.user_id === userId ? { ...s, status } : s));
  };

  // ADVANCED CUSTOM EXPORT (.TXT or .XLSX) BASED ON SELECTION
  const handleExecuteCustomExport = async () => {
    setShowExportModal(false);
    const subName = currentSub ? currentSub.name : 'Subject';
    const yr = currentSub ? normalizeYear(currentSub.year_level) : '';
    const secName = selectedSection !== 'all' ? selectedSection : 'All';
    const filename = `Attendance_${subName}_${secName}_Week${week}_${exportFilter}_${sessionDate}`;

    const isRecordedStatus = (st) => {
      if (!st) return false;
      const s = String(st).toLowerCase().trim();
      return s === 'present' || s === 'absent' || s === 'late' || s === 'excused' || s === 'حاضر' || s === 'غائب' || s === 'تأخير' || s === 'عذر';
    };

    let targetStudents = baseEnrolledStudents;
    if (attendanceType === 'lecture' && selectedGroup !== 'all') {
      targetStudents = targetStudents.filter(s => getStudentLectureGroup(s, selectedSubject) === selectedGroup);
    }

    if (exportFilter === 'recorded') {
      targetStudents = targetStudents.filter(s => isRecordedStatus(attendanceRecords[s.user_id]));
    } else if (exportFilter === 'present') {
      targetStudents = targetStudents.filter(s => attendanceRecords[s.user_id] === 'present');
    } else if (exportFilter === 'absent') {
      targetStudents = targetStudents.filter(s => attendanceRecords[s.user_id] === 'absent');
    } else if (exportFilter === 'late') {
      targetStudents = targetStudents.filter(s => attendanceRecords[s.user_id] === 'late');
    } else if (exportFilter === 'excused') {
      targetStudents = targetStudents.filter(s => attendanceRecords[s.user_id] === 'excused');
    }

    // Combine with any extra students explicitly added for this export
    const effectiveExportRecords = { ...attendanceRecords };
    const finalExportStudents = [...targetStudents];

    exportExtraStudents.forEach(extra => {
      effectiveExportRecords[extra.user_id] = extra.status || 'present';
      const matchesFilter =
        exportFilter === 'all' ||
        exportFilter === 'recorded' ||
        exportFilter === (extra.status || 'present');

      if (matchesFilter && !finalExportStudents.some(s => String(s.user_id).trim() === String(extra.user_id).trim())) {
        finalExportStudents.push(extra);
      }
    });

    // Optionally save extra attendance to Supabase
    if (saveExtraAttendanceToDb && exportExtraStudents.length > 0) {
      try {
        const effWeek = getEffectiveWeekNum();
        const upsertRows = exportExtraStudents.map(extra => ({
          student_id: extra.user_id,
          subject_id: selectedSubject,
          week_number: effWeek,
          status: extra.status || 'present'
        }));
        supabase.from('attendance').upsert(upsertRows, { onConflict: 'student_id,subject_id,week_number' }).catch(() => {});
      } catch (err) {}
    }

    if (exportFormat === 'txt') {
      // Output clean, raw IDs line-by-line without brackets or extra text for direct 1-click copy/paste
      const idLines = finalExportStudents.map(s => s.user_id.trim()).filter(Boolean);
      const txt = idLines.join('\r\n');

      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (exportFormat === 'pdf') {
      const activeInst = attendanceType === 'lecture'
        ? (currentSub?.instructor_name || 'أستاذ المادة')
        : (getSectionInstructorName(selectedSubject, selectedSection) || currentSub?.instructor_name || 'معيد المادة');

      const resolvedGroupName = attendanceType === 'lecture'
        ? (selectedGroup !== 'all' ? selectedGroup : 'A / B')
        : (secName !== 'All' ? secName : 'كافة السكاشن');

      setPdfExportLoading(true);
      setPdfProgressText('جاري تجهيز كشف الغياب (PDF)...');
      try {
        const result = await printWeekAttendancePDF({
          subjectName: subName,
          yearLevel: yr,
          sectionName: resolvedGroupName,
          groupName: resolvedGroupName,
          weekNum: week,
          sessionDate: sessionDate,
          instructorName: activeInst,
          attendanceType: attendanceType,
          filterType: exportFilter,
          students: finalExportStudents,
          attendanceRecords: effectiveExportRecords,
          excuseReasons: excuseReasons,
          getStudentSubSection: (s) => s.nativeSection || getStudentSubSection(s, selectedSubject),
          getStudentLectureGroup: (s) => s.nativeGroup || getStudentLectureGroup(s, selectedSubject),
          studentScores: sectionScores,
          showSectionScore: attendanceType === 'section' && secPartConfig.enabled,
          maxSectionScore: secPartConfig.max || 5,
          filename: `${filename}.pdf`,
          onProgress: (cur, tot) => {
            setPdfProgressText(`جاري تجهيز صفحة ${cur} من ${tot}...`);
          }
        });

        if (result && result.blobUrl) {
          setDownloadedPdfInfo(result);
          setMessage('✅ تم تنزيل كشف الغياب (PDF) بنجاح على جهازك!');
          setTimeout(() => setMessage(''), 4000);
        }
      } catch (pdfErr) {
        console.error('Attendance PDF export error:', pdfErr);
        setMessage('❌ تعذر استخراج ملف PDF. يرجى المحاولة مرة أخرى.');
        setTimeout(() => setMessage(''), 4000);
      } finally {
        setPdfExportLoading(false);
        setPdfProgressText('');
      }
    } else {
      // Excel Export
      const excelRows = finalExportStudents.map((s, idx) => {
        const st = effectiveExportRecords[s.user_id] || 'لم يرصد';
        const stLabel = st === 'present' ? 'حاضر' : st === 'absent' ? 'غائب' : st === 'late' ? 'تأخير' : st === 'excused' ? 'عذر' : 'لم يرصد';
        const nativeGrp = s.nativeGroup || getStudentLectureGroup(s, selectedSubject);
        const isFromOtherGroup = s.isExtra || (attendanceType === 'lecture' && selectedGroup !== 'all' && nativeGrp !== selectedGroup);
        const groupDisplay = isFromOtherGroup ? `${nativeGrp} (حاضر مع ${selectedGroup})` : nativeGrp;
        return {
          'م': idx + 1,
          'الرقم الأكاديمي': s.user_id,
          'اسم الطالب': s.name,
          'الفرقة': normalizeYear(s.year_level),
          'السكشن': s.nativeSection || getStudentSubSection(s, selectedSubject),
          'الجروب': groupDisplay,
          'الأسبوع': `الأسبوع ${week}`,
          'تاريخ المحاضرة': sessionDate,
          'الحالة': stLabel,
          'ملاحظات': isFromOtherGroup ? 'طالب من مجموعة أخرى' : '',
          'سبب العذر': excuseReasons[s.user_id] || ''
        };
      });
      await exportExcelFile(excelRows, `${filename}.xlsx`);
    }
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

  // Realtime counters for currently active students
  let countPresent = 0;
  let countAbsent = 0;
  let countLate = 0;
  let countExcused = 0;
  baseEnrolledStudents.forEach(stu => {
    const st = attendanceRecords[stu.user_id];
    if (st === 'present') countPresent++;
    else if (st === 'absent') countAbsent++;
    else if (st === 'late') countLate++;
    else if (st === 'excused') countExcused++;
  });
  const countUnrecorded = baseEnrolledStudents.length - (countPresent + countAbsent + countLate + countExcused);

  const handleDownloadAttendanceTemplate = async () => {
    if (!currentSub) return;
    const targetStudents = displayedEnrolledStudents.length > 0 ? displayedEnrolledStudents : enrolledStudents;
    await exportAttendanceTemplateExcel(targetStudents, currentSub.name, currentSub.total_weeks || 12, attendanceType, selectedGroup);
  };

  const handleAttendanceFileSelect = async (file) => {
    setImportAttendanceFile(file);
    if (!file) {
      setImportDetectedSheets([]);
      setImportDatesConfig({});
      setImportAttendanceStatus('');
      return;
    }

    try {
      setImportAttendanceStatus('جاري فحص وقراءة أوراق العمل (Sheets) في الملف...');
      const parsedRows = await parseAttendanceExcelFile(file);
      const sheets = parsedRows.sheets || [];

      if (!sheets || sheets.length === 0) {
        setImportDetectedSheets([]);
        setImportDatesConfig({});
        setImportAttendanceStatus('❌ لم يتم العثور على أي شيت أو بيانات صالحة في هذا الملف.');
        return;
      }

      const availableSubs = allSystemSubjects.length > 0 ? allSystemSubjects : subjects;
      let studentPool = allStudents;
      if (!studentPool || studentPool.length === 0) {
        studentPool = enrolledStudents;
      }

      const defaultDate = sessionDate || new Date().toISOString().split('T')[0];
      const initialDatesConfig = {};

      const preparedSheets = sheets.map((sh, idx) => {
        const matched = matchSheetToSubject(sh.sheetName, availableSubs);
        const targetSubId = matched ? matched.id : (selectedSubject || availableSubs[0]?.id || '');
        const targetSub = availableSubs.find(s => s.id === targetSubId);
        const targetSubName = (targetSub?.name) || sh.sheetName;

        const weeks = sh.weeksDetected && sh.weeksDetected.length > 0 ? sh.weeksDetected : [week];
        const secs = extractDetectedSections(sh.records, targetSubId, studentPool);

        initialDatesConfig[idx] = {};
        weeks.forEach(wNum => {
          const fallbackDate = getWeekDefaultDate(wNum) || defaultDate;
          const existingGen = getExistingDateForWeek(targetSub, wNum, null, attendanceType === 'lecture') || fallbackDate;
          const secDates = {};
          let hasAnyDistinctSecDate = false;
          secs.forEach(s => {
            const existingSec = getExistingDateForWeek(targetSub, wNum, s, false);
            if (existingSec && existingSec !== existingGen) {
              hasAnyDistinctSecDate = true;
            }
            secDates[s] = existingSec || existingGen;
          });

          initialDatesConfig[idx][wNum] = {
            generalDate: existingGen,
            perSection: hasAnyDistinctSecDate,
            sections: secDates
          };
        });

        return {
          ...sh,
          sheetIndex: idx,
          targetSubjectId: targetSubId,
          targetSubjectName: targetSubName,
          detectedSections: secs,
          isAutoMatched: Boolean(matched)
        };
      });

      setImportDetectedSheets(preparedSheets);
      setImportDatesConfig(initialDatesConfig);
      setImportAllSheetsMode(preparedSheets.length > 1);
      setSelectedImportSheetIndex(0);
      setActiveDateConfigSheetIdx(0);
      setActiveDateConfigWeek(preparedSheets[0]?.weeksDetected?.[0] || week);
      setImportAttendanceStatus('');
    } catch (err) {
      console.error('File inspection error:', err);
      setImportDetectedSheets([]);
      setImportDatesConfig({});
      setImportAttendanceStatus('❌ فشل فحص الملف: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  const handleUpdateSheetSubject = (sheetIndex, newSubId) => {
    const availableSubs = allSystemSubjects.length > 0 ? allSystemSubjects : subjects;
    const subObj = availableSubs.find(s => s.id === newSubId);
    let studentPool = allStudents;
    if (!studentPool || studentPool.length === 0) studentPool = enrolledStudents;

    setImportDetectedSheets(prev => prev.map((sh, idx) => {
      if (idx !== sheetIndex) return sh;
      const detectedSecs = extractDetectedSections(sh.records, newSubId, studentPool);
      return {
        ...sh,
        targetSubjectId: newSubId,
        targetSubjectName: subObj?.name || sh.sheetName,
        detectedSections: detectedSecs,
        isAutoMatched: true
      };
    }));

    setImportDatesConfig(prev => {
      const currentSheetCfg = { ...(prev[sheetIndex] || {}) };
      const sh = importDetectedSheets[sheetIndex];
      if (!sh) return prev;
      const weeks = sh.weeksDetected?.length > 0 ? sh.weeksDetected : [week];
      const secs = extractDetectedSections(sh.records, newSubId, studentPool);

      weeks.forEach(wNum => {
        const fallbackDate = getWeekDefaultDate(wNum) || sessionDate;
        const existingGenDate = getExistingDateForWeek(subObj, wNum, null, attendanceType === 'lecture') || fallbackDate;
        const prevW = currentSheetCfg[wNum] || {};
        const newSecDates = { ...(prevW.sections || {}) };
        secs.forEach(s => {
          if (!newSecDates[s]) {
            newSecDates[s] = getExistingDateForWeek(subObj, wNum, s, false) || existingGenDate;
          }
        });
        currentSheetCfg[wNum] = {
          ...prevW,
          generalDate: existingGenDate || prevW.generalDate || sessionDate,
          sections: newSecDates
        };
      });

      return { ...prev, [sheetIndex]: currentSheetCfg };
    });
  };

  const handleUpdateGeneralDate = (sheetIdx, weekNum, newDate) => {
    setImportDatesConfig(prev => {
      const sheetCfg = { ...(prev[sheetIdx] || {}) };
      const weekCfg = { ...(sheetCfg[weekNum] || {}) };
      const prevSections = { ...(weekCfg.sections || {}) };

      if (!weekCfg.perSection) {
        Object.keys(prevSections).forEach(s => {
          prevSections[s] = newDate;
        });
      }

      sheetCfg[weekNum] = {
        ...weekCfg,
        generalDate: newDate,
        sections: prevSections
      };
      return { ...prev, [sheetIdx]: sheetCfg };
    });
  };

  const handleTogglePerSection = (sheetIdx, weekNum) => {
    setImportDatesConfig(prev => {
      const sheetCfg = { ...(prev[sheetIdx] || {}) };
      const weekCfg = { ...(sheetCfg[weekNum] || {}) };
      const currentPerSec = Boolean(weekCfg.perSection);
      const newPerSec = !currentPerSec;

      const sh = importDetectedSheets[sheetIdx];
      const secs = sh?.detectedSections?.length > 0 ? sh.detectedSections : ['S1', 'S2', 'S3', 'S4'];
      const currentSections = { ...(weekCfg.sections || {}) };

      secs.forEach(s => {
        if (!currentSections[s]) {
          currentSections[s] = weekCfg.generalDate || sessionDate;
        }
      });

      sheetCfg[weekNum] = {
        ...weekCfg,
        perSection: newPerSec,
        sections: currentSections
      };
      return { ...prev, [sheetIdx]: sheetCfg };
    });
  };

  const handleUpdateSectionDate = (sheetIdx, weekNum, sec, newDate) => {
    setImportDatesConfig(prev => {
      const sheetCfg = { ...(prev[sheetIdx] || {}) };
      const weekCfg = { ...(sheetCfg[weekNum] || {}) };
      const updatedSecs = { ...(weekCfg.sections || {}), [sec]: newDate };

      sheetCfg[weekNum] = {
        ...weekCfg,
        sections: updatedSecs
      };
      return { ...prev, [sheetIdx]: sheetCfg };
    });
  };

  const handleCopyDatesToAllWeeks = (sheetIdx, sourceWeekNum) => {
    setImportDatesConfig(prev => {
      const sheetCfg = { ...(prev[sheetIdx] || {}) };
      const sourceCfg = sheetCfg[sourceWeekNum];
      if (!sourceCfg) return prev;

      const sh = importDetectedSheets[sheetIdx];
      const weeks = sh?.weeksDetected?.length > 0 ? sh.weeksDetected : [week];

      weeks.forEach(wNum => {
        sheetCfg[wNum] = {
          generalDate: sourceCfg.generalDate,
          perSection: sourceCfg.perSection,
          sections: { ...(sourceCfg.sections || {}) }
        };
      });

      return { ...prev, [sheetIdx]: sheetCfg };
    });
    setMessage(`✅ تم نسخ تواريخ أسبوع ${sourceWeekNum} لجميع أسابيع الشيت بنجاح.`);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleAddManualSection = (sheetIdx) => {
    const secName = window.prompt('أدخل رمز أو رقم السكشن الجديد (مثال: S5 أو 5):');
    if (!secName) return;
    const normSec = normalizeSection(secName);
    
    setImportDetectedSheets(prev => prev.map((sh, idx) => {
      if (idx !== sheetIdx) return sh;
      const existing = sh.detectedSections || [];
      if (existing.includes(normSec)) return sh;
      return {
        ...sh,
        detectedSections: [...existing, normSec].sort((a, b) => (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0))
      };
    }));

    setImportDatesConfig(prev => {
      const sheetCfg = { ...(prev[sheetIdx] || {}) };
      Object.keys(sheetCfg).forEach(wNum => {
        const wCfg = { ...(sheetCfg[wNum] || {}) };
        const secDates = { ...(wCfg.sections || {}) };
        if (!secDates[normSec]) {
          secDates[normSec] = wCfg.generalDate || sessionDate;
        }
        sheetCfg[wNum] = {
          ...wCfg,
          perSection: true,
          sections: secDates
        };
      });
      return { ...prev, [sheetIdx]: sheetCfg };
    });
  };

  const handleProcessAttendanceImport = async () => {
    if (!importAttendanceFile) return;
    try {
      setImportingAttendance(true);
      setImportAttendanceStatus('جاري معالجة شيتات الإكسيل ورصد السجلات...');

      const availableSubs = allSystemSubjects.length > 0 ? allSystemSubjects : subjects;
      let sheetsToProcess = [];

      if (importDetectedSheets.length > 0) {
        if (importAllSheetsMode && importDetectedSheets.length > 1) {
          sheetsToProcess = importDetectedSheets;
        } else {
          const idx = (selectedImportSheetIndex >= 0 && selectedImportSheetIndex < importDetectedSheets.length) ? selectedImportSheetIndex : 0;
          sheetsToProcess = [importDetectedSheets[idx]];
        }
      } else {
        const parsedRows = await parseAttendanceExcelFile(importAttendanceFile);
        const sheets = parsedRows.sheets || [];
        if (sheets.length === 0) {
          throw new Error('لم يتم العثور على أوراق عمل صالحة في ملف الإكسيل.');
        }
        sheetsToProcess = sheets.map((sh, idx) => {
          const matched = matchSheetToSubject(sh.sheetName, availableSubs);
          return {
            ...sh,
            sheetIndex: idx,
            targetSubjectId: matched ? matched.id : (selectedSubject || availableSubs[0]?.id || ''),
            targetSubjectName: matched ? matched.name : sh.sheetName
          };
        });
      }

      if (sheetsToProcess.length === 0) {
        throw new Error('لم يتم العثور على بيانات صالحة للرصد في الملف.');
      }

      // Ensure global student pool is loaded; fallback to DB if empty
      let studentPool = allStudents;
      if (!studentPool || studentPool.length === 0) {
        const { data: dbStudents } = await supabase.from('users').select('id, user_id, name, year_level, section, assigned_subjects').eq('role', 'student');
        if (dbStudents && dbStudents.length > 0) {
          studentPool = dbStudents;
          setAllStudents(dbStudents);
        } else {
          studentPool = enrolledStudents;
        }
      }

      const norm = (v) => String(v || '').replace(/\.0+$/, '').trim().toLowerCase();
      const digitsOnly = (v) => String(v || '').replace(/\D/g, '');

      let totalSavedRecords = 0;
      let totalMatchedStudents = 0;
      const processedSubjectNames = [];

      for (let sIdx = 0; sIdx < sheetsToProcess.length; sIdx++) {
        const currentSheet = sheetsToProcess[sIdx];
        const subId = String(currentSheet.targetSubjectId || selectedSubject).trim();
        const targetSub = availableSubs.find(s => s.id === subId) || subjects.find(s => s.id === subId) || allSystemSubjects.find(s => s.id === subId);
        const subName = targetSub?.name || currentSheet.sheetName;
        const maxWeeks = targetSub?.total_weeks || 15;

        setImportAttendanceStatus(`جاري رصد مادة [${subName}] (شيت ${currentSheet.sheetName})... (${sIdx + 1}/${sheetsToProcess.length})`);

        const rowsMap = new Map();
        let sheetMatchedCount = 0;

        currentSheet.records.forEach(rec => {
          const matchedStudent = studentPool.find(s => {
            const sId = norm(s.user_id);
            const rId = norm(rec.studentId);
            const sDigits = digitsOnly(s.user_id);
            const rDigits = digitsOnly(rec.studentId);

            const idMatches = (sId && rId && sId === rId) || (sDigits && rDigits && sDigits === rDigits && sDigits.length >= 3);
            const nameMatches = s.name && rec.studentName && s.name.trim().toLowerCase() === rec.studentName.trim().toLowerCase();

            return idMatches || nameMatches;
          });

          if (matchedStudent) {
            sheetMatchedCount++;
            Object.keys(rec.weekStatuses).forEach(wStr => {
              const wNum = parseInt(wStr, 10);
              if (wNum >= 1 && wNum <= maxWeeks) {
                const rawSt = rec.weekStatuses[wStr];
                let cleanStatus = 'present';
                if (rawSt === 'absent') cleanStatus = 'absent';
                else if (rawSt === 'late') cleanStatus = 'late';
                else if (rawSt === 'excused') cleanStatus = 'excused';
                else cleanStatus = 'present';

                const stuId = String(matchedStudent.user_id).trim();
                const dbWeekNum = attendanceType === 'lecture' ? 100 + wNum : wNum;
                const key = stuId + '_' + subId + '_' + dbWeekNum;

                rowsMap.set(key, {
                  student_id: stuId,
                  subject_id: subId,
                  week_number: dbWeekNum,
                  status: cleanStatus
                });
              }
            });
          }
        });

        const uniqueRows = Array.from(rowsMap.values());
        if (uniqueRows.length > 0) {
          totalMatchedStudents += sheetMatchedCount;
          processedSubjectNames.push(subName);

          // Save all configured week & section dates for this subject
          try {
            const sheetCfg = importDatesConfig[sIdx] || importDatesConfig[currentSheet.sheetIndex] || {};
            const dateEntriesToSave = [];

            Object.keys(sheetCfg).forEach(wKey => {
              const wNum = parseInt(wKey, 10);
              const wVal = sheetCfg[wKey];
              if (!wVal) return;

              if (wVal.generalDate) {
                dateEntriesToSave.push({
                  weekNum: wNum,
                  dateStr: wVal.generalDate,
                  section: null,
                  isLecture: attendanceType === 'lecture'
                });
              }

              if (wVal.perSection && wVal.sections && attendanceType === 'section') {
                Object.entries(wVal.sections).forEach(([sec, sDate]) => {
                  if (sDate) {
                    dateEntriesToSave.push({
                      weekNum: wNum,
                      dateStr: sDate,
                      section: sec,
                      isLecture: false
                    });
                  }
                });
              }
            });

            if (dateEntriesToSave.length === 0) {
              dateEntriesToSave.push({
                weekNum: week,
                dateStr: sessionDate,
                section: selectedSection !== 'all' ? selectedSection : null,
                isLecture: attendanceType === 'lecture'
              });
            }

            await saveSubjectBatchDates(subId, dateEntriesToSave);

            if (subId === selectedSubject) {
              const activeWeekEntry = dateEntriesToSave.find(e => e.weekNum === week && (e.section === selectedSection || (!e.section && selectedSection === 'all')));
              if (activeWeekEntry?.dateStr) {
                setSessionDate(activeWeekEntry.dateStr);
              }
            }
          } catch (e) {
            console.warn('saveSubjectBatchDates warning:', e);
          }

          // Chunked Upsert (20 rows per chunk) with individual row fallback
          const chunkSize = 20;
          for (let i = 0; i < uniqueRows.length; i += chunkSize) {
            const chunk = uniqueRows.slice(i, i + chunkSize);
            try {
              const { error } = await supabase.from('attendance').upsert(chunk, { onConflict: 'student_id,subject_id,week_number' });
              if (!error) {
                totalSavedRecords += chunk.length;
              } else {
                for (const singleRow of chunk) {
                  try {
                    const { error: sErr } = await supabase.from('attendance').upsert(singleRow, { onConflict: 'student_id,subject_id,week_number' });
                    if (!sErr) totalSavedRecords++;
                  } catch (e) {}
                }
              }
            } catch (err) {
              for (const singleRow of chunk) {
                try {
                  const { error: sErr } = await supabase.from('attendance').upsert(singleRow, { onConflict: 'student_id,subject_id,week_number' });
                  if (!sErr) totalSavedRecords++;
                } catch (e) {}
              }
            }
          }
        }
      }

      if (totalSavedRecords === 0) {
        throw new Error('لم يتم العثور على طُلاب مطابقين بالأرقام الأكاديمية (ID) المسجلة في المواد، أو لم يتم وضع قيم حضور/غياب في أعمدة الأسابيع.');
      }

      cacheManager.clear();
      await fetchAttendance();

      const uniqueSubjectNames = [...new Set(processedSubjectNames)];
      setMessage(`✅ تم استيراد ورصد ${totalSavedRecords} سجل غياب بنجاح لـ ${totalMatchedStudents} طالب عبر ${uniqueSubjectNames.length} مادة (${uniqueSubjectNames.join('، ')}) وتسميعها فوراً لجميع المعيدين والطلاب والتقرير الشامل!`);
      setTimeout(() => setMessage(''), 6000);
      setShowImportAttendanceModal(false);
      setImportAttendanceFile(null);
      setImportDetectedSheets([]);
      setImportDatesConfig({});
      setImportAttendanceStatus('');

    } catch (err) {
      console.error('Attendance import error:', err);
      setImportAttendanceStatus('❌ خطأ: ' + (err.message || 'فشل معالجة شيت الإكسيل'));
    } finally {
      setImportingAttendance(false);
    }
  };

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
              <span style={{fontSize:'0.85rem',color: 'var(--success)',fontWeight:700,background:'rgba(16,185,129,0.1)',padding:'3px 8px',borderRadius:'4px',border:'1px solid rgba(16,185,129,0.2)'}}>
                {autoSaveStatus}
              </span>
            )}
          </div>
          <p className="text-muted" style={{margin:'5px 0 0 0'}}>
            الطلاب المعروضون: <strong>{displayedEnrolledStudents.length} طالب</strong> {attendanceType === 'lecture' ? (selectedGroup !== 'all' ? '(مجموعة ' + selectedGroup + ')' : '(جميع مجموعات المحاضرة)') : (selectedSection !== 'all' ? '(سكشن ' + selectedSection + ')' : '(جميع السكاشن)')}
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
            onClick={() => setShowImportAttendanceModal(true)} 
            disabled={!selectedSubject}
            style={{borderColor:'rgba(79, 70, 229, 0.4)',color:'var(--primary-hover)',display:'flex',alignItems:'center',gap:'8px',padding:'9px 16px',fontSize:'0.9rem'}}
            title="استيراد ورصد الغياب كلياً من ملف Excel"
          >
            <FileSpreadsheet size={18} /> 📥 استيراد غياب من Excel
          </button>
          <button 
            className="btn-primary" 
            onClick={handleOpenExportModal} 
            disabled={!selectedSubject || displayedEnrolledStudents.length === 0}
            style={{background:'var(--primary)',display:'flex',alignItems:'center',gap:'8px',padding:'9px 16px',fontSize:'0.9rem'}}
            title="تصدير كشف الحضور أو الغياب كملف TXT أو Excel"
          >
            <Download size={18} /> تصدير كشف الأسبوع (.txt / Excel / PDF)
          </button>
          {attendanceType === 'lecture' && (
            <button
              className="btn-secondary"
              onClick={() => {
                setCloneSourceSubject('');
                setCloneSourceWeek(week);
                setCloneSourceType('lecture');
                setClonePreview(null);
                setCloneDefaultForExtra('absent');
                setCloneManualExtra({});
                setShowCloneModal(true);
              }}
              disabled={!selectedSubject}
              style={{
                borderColor: 'rgba(13, 148, 136, 0.5)',
                color: '#2dd4bf',
                background: 'rgba(13, 148, 136, 0.08)',
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '9px 16px', fontSize: '0.9rem'
              }}
              title="نسخ الحضور الذكي من محاضرة أخرى لنفس الدفعة"
            >
              <Copy size={18} /> 📋 نسخ الحضور من محاضرة أخرى
            </button>
          )}
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

      {/* ATTENDANCE TYPE SELECTOR (SECTIONS VS LECTURES) */}
      <div style={{display:'flex',gap:'10px',marginBottom:'1.2rem',background:'var(--surface)',padding:'6px',borderRadius:'10px',border:'1px solid var(--border)',width:'fit-content'}}>
        <button 
          onClick={() => handleToggleAttendanceType('section')}
          style={{
            background: attendanceType === 'section' ? 'var(--primary)' : 'transparent',
            color: attendanceType === 'section' ? 'white' : 'var(--text-muted)',
            border: 'none', padding: '8px 18px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.92rem', transition: 'all 0.2s'
          }}
        >
          <span>🏢</span> غياب السكاشن (Section)
        </button>
        <button 
          onClick={() => handleToggleAttendanceType('lecture')}
          style={{
            background: attendanceType === 'lecture' ? '#0d9488' : 'transparent',
            color: attendanceType === 'lecture' ? 'white' : 'var(--text-muted)',
            border: 'none', padding: '8px 18px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.92rem', transition: 'all 0.2s'
          }}
        >
          <span>🏛️</span> غياب المحاضرات (Lectures - متاح لكافة المعيدين)
        </button>
      </div>

      {/* FILTER BAR WITH SECTION/GROUP AND TA LABEL */}
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
          <select className="input-field" value={selectedSubject} onChange={e => { setSelectedSubject(e.target.value); setSelectedGroup('all'); setSelectedSection('all'); const sub = activeSubjectsPool.find(s => s.id === e.target.value); if (sub) setFilterYearToAdd(normalizeYear(sub.year_level)); }}>
            {displayedSubjects.length === 0 ? <option value="">-- لا توجد مواد متاحة --</option> : displayedSubjects.map(s => <option key={s.id} value={s.id}>{s.name} (فرقة {normalizeYear(s.year_level)})</option>)}
          </select>
        </div>

        {attendanceType === 'lecture' ? (
          <div style={{flex:1.5,minWidth:'190px'}}>
            <label style={{display:'block',marginBottom:'8px',fontSize:'0.9rem',color:'#2dd4bf',fontWeight:'bold'}}>3. تصفية مجموعة المحاضرة (Group):</label>
            <select className="input-field" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
              <option value="all">جميع مجموعات المحاضرة ({enrolledStudents.length} طالب)</option>
              <option value="A">مجموعة A (Group A - سكاشن 1 و 2) ({groupACount} طالب)</option>
              {groupBCount > 0 ? (
                <option value="B">مجموعة B (Group B - سكاشن 3 و 4) ({groupBCount} طالب)</option>
              ) : null}
            </select>
          </div>
        ) : (
          <div style={{flex:1.5,minWidth:'190px'}}>
            <label style={{display:'block',marginBottom:'8px',fontSize:'0.9rem',color:'var(--success)',fontWeight:'bold'}}>3. تصفية السكشن والمعيد:</label>
            <select className="input-field" value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
              <option value="all">جميع سكاشن المادة ({enrolledStudents.length} طالب)</option>
              {availableSections.map(sec => {
                const taName = selectedSubject ? getSectionInstructorName(selectedSubject, sec) : '';
                return (
                  <option key={sec} value={sec}>
                    [ {sec} ] سكشن {sec.replace('S','')} {taName ? '— ' + taName : ''}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {currentSub && (
          <div style={{flex:1.5,minWidth:'180px'}}>
            <label style={{display:'block',marginBottom:'8px',fontSize:'0.9rem',fontWeight:'bold'}}>4. رقم الأسبوع:</label>
            <select className="input-field" value={week} onChange={e => {
              const newW = Number(e.target.value);
              setWeek(newW);
              if (newW === getAcademicWeekFromDate()) {
                setSessionDate(getTodayDateStr());
              } else {
                setSessionDate(getWeekDefaultDate(newW));
              }
            }}>
              {Array.from({length:currentSub.total_weeks || 12},(_,i)=>i+1).map(w => {
                const isCurrent = w === getAcademicWeekFromDate();
                const startStr = formatDisplayDate(getWeekDefaultDate(w));
                const endStr = formatDisplayDate(getWeekEndDate(w));
                return (
                  <option key={w} value={w}>
                    الأسبوع {w} ({startStr} - {endStr}){isCurrent ? ' 📍 (الأسبوع الحالي)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <div style={{flex:1.4,minWidth:'175px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
            <label style={{fontSize:'0.9rem',fontWeight:'bold',color:'var(--primary-hover)',margin:0}}>
              5. تاريخ المحاضرة/السكشن:
            </label>
            <button
              type="button"
              onClick={async () => {
                const today = getTodayDateStr();
                setSessionDate(today);
                await saveSubjectWeekDate(selectedSubject, week, today);
              }}
              style={{
                background: sessionDate === getTodayDateStr() ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                color: sessionDate === getTodayDateStr() ? 'var(--success)' : 'var(--primary-hover)',
                border: '1px solid ' + (sessionDate === getTodayDateStr() ? 'var(--success)' : 'var(--primary)'),
                borderRadius: '5px',
                padding: '2px 8px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="الضغط هنا لضبط تاريخ الكشف على تاريخ اليوم الحالي فوراً"
            >
              {sessionDate === getTodayDateStr() ? '✓ مسجل بتاريخ اليوم' : `📅 اليوم (${formatDisplayDate(getTodayDateStr())})`}
            </button>
          </div>
          <input 
            type="date" 
            className="input-field" 
            value={sessionDate} 
            onChange={async (e) => {
              const newDate = e.target.value;
              setSessionDate(newDate);
              await saveSubjectWeekDate(selectedSubject, week, newDate);
            }} 
          />
        </div>
      </div>

      {/* Offline Notice Banner */}
      {offlineNotice && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          color: '#fbbf24',
          padding: '10px 16px',
          borderRadius: '10px',
          marginBottom: '1.2rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <WifiOff size={18} style={{flexShrink:0}} />
          <span>{offlineNotice}</span>
        </div>
      )}

      {/* SECTION PARTICIPATION CONFIGURATION TOGGLE (Per Subject) */}
      {attendanceType === 'section' && selectedSubject && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: secPartConfig.enabled ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255, 255, 255, 0.02)',
          border: '1px solid ' + (secPartConfig.enabled ? 'rgba(99, 102, 241, 0.3)' : 'var(--border)'),
          borderRadius: '10px',
          padding: '10px 16px',
          marginBottom: '1.2rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>⭐</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.92rem', color: secPartConfig.enabled ? 'var(--primary-hover)' : 'var(--text-main)' }}>
                درجة مشاركة السكشن ({currentSub?.name}):
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {secPartConfig.enabled
                  ? `مفعلة لهذه المادة فقط (الدرجة القصوى: ${secPartConfig.max} درجات لكل سكشن) — تظهر بالجدول والكروت وكشف الغياب`
                  : 'معطلة حالياً لهذه المادة (لا تظهر أي درجات مشاركة للسكشن افتراضياً إلا إذا قام المعيد بتفعيلها لهذه المادة)'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {secPartConfig.enabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>الدرجة من:</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={secPartConfig.max}
                  onChange={(e) => handleToggleSecPart(true, e.target.value)}
                  style={{
                    width: '54px',
                    padding: '4px 6px',
                    textAlign: 'center',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text-main)',
                    fontWeight: 800,
                    fontSize: '0.88rem'
                  }}
                  title="تحديد الدرجة العظمى لمشاركة السكشن لهذه المادة"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => handleToggleSecPart(!secPartConfig.enabled)}
              style={{
                background: secPartConfig.enabled ? 'var(--primary)' : 'transparent',
                color: secPartConfig.enabled ? '#fff' : 'var(--text-muted)',
                border: '1px solid ' + (secPartConfig.enabled ? 'var(--primary)' : 'var(--border)'),
                borderRadius: '8px',
                padding: '6px 14px',
                fontWeight: 800,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              {secPartConfig.enabled ? '✓ مفعلة لهذه المادة' : '○ تفعيل درجة المشاركة للمادة'}
            </button>
          </div>
        </div>
      )}

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

          {/* Quick Status Interactive Filter Buttons */}
          <div style={{display:'flex',gap:'8px',alignItems:'center',fontSize:'0.85rem',fontWeight:700,flexWrap:'wrap'}}>
            <button 
              type="button"
              onClick={() => setStatusFilter('all')}
              style={{
                cursor:'pointer',
                border: statusFilter === 'all' ? '2px solid var(--primary-hover)' : '1px solid var(--border)',
                background: statusFilter === 'all' ? 'rgba(79, 70, 229, 0.25)' : 'var(--bg)',
                color: statusFilter === 'all' ? '#ffffff' : 'var(--text-muted)',
                padding:'5px 10px',
                borderRadius:'8px',
                fontWeight: 800,
                transition: 'all 0.15s ease'
              }}
              title="عرض جميع الطلاب"
            >
              📋 الكل: {baseEnrolledStudents.length}
            </button>

            <button 
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'recorded' ? 'all' : 'recorded')}
              style={{
                cursor:'pointer',
                border: statusFilter === 'recorded' ? '2px solid #0d9488' : '1px solid rgba(13, 148, 136, 0.3)',
                background: statusFilter === 'recorded' ? 'rgba(13, 148, 136, 0.25)' : 'rgba(13, 148, 136, 0.08)',
                color: '#2dd4bf',
                padding:'5px 10px',
                borderRadius:'8px',
                fontWeight: 800,
                boxShadow: statusFilter === 'recorded' ? '0 0 10px rgba(13, 148, 136, 0.3)' : 'none',
                transition: 'all 0.15s ease'
              }}
              title="عرض الطلاب الذين تم رصدهم فقط (حاضر + غائب + تأخير + عذر)"
            >
              🎯 المرصودون: {countPresent + countAbsent + countLate + countExcused}
            </button>

            <button 
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'present' ? 'all' : 'present')}
              style={{
                cursor:'pointer',
                border: statusFilter === 'present' ? '2px solid var(--success)' : '1px solid rgba(16, 185, 129, 0.3)',
                background: statusFilter === 'present' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.08)',
                color: 'var(--success)',
                padding:'5px 10px',
                borderRadius:'8px',
                fontWeight: 800,
                boxShadow: statusFilter === 'present' ? '0 0 10px rgba(16, 185, 129, 0.3)' : 'none',
                transition: 'all 0.15s ease'
              }}
              title="تصفية الطلاب الحاضرين فقط"
            >
              ● حاضر: {countPresent}
            </button>

            <button 
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'absent' ? 'all' : 'absent')}
              style={{
                cursor:'pointer',
                border: statusFilter === 'absent' ? '2px solid var(--danger)' : '1px solid rgba(239, 68, 68, 0.3)',
                background: statusFilter === 'absent' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.08)',
                color: 'var(--danger)',
                padding:'5px 10px',
                borderRadius:'8px',
                fontWeight: 800,
                boxShadow: statusFilter === 'absent' ? '0 0 10px rgba(239, 68, 68, 0.3)' : 'none',
                transition: 'all 0.15s ease'
              }}
              title="تصفية الطلاب الغائبين فقط"
            >
              ● غائب: {countAbsent}
            </button>

            <button 
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'late' ? 'all' : 'late')}
              style={{
                cursor:'pointer',
                border: statusFilter === 'late' ? '2px solid var(--warning)' : '1px solid rgba(245, 158, 11, 0.3)',
                background: statusFilter === 'late' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.08)',
                color: 'var(--warning)',
                padding:'5px 10px',
                borderRadius:'8px',
                fontWeight: 800,
                boxShadow: statusFilter === 'late' ? '0 0 10px rgba(245, 158, 11, 0.3)' : 'none',
                transition: 'all 0.15s ease'
              }}
              title="تصفية الطلاب المتأخرين فقط"
            >
              ● تأخير: {countLate}
            </button>

            <button 
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'excused' ? 'all' : 'excused')}
              style={{
                cursor:'pointer',
                border: statusFilter === 'excused' ? '2px solid #3b82f6' : '1px solid rgba(59, 130, 246, 0.3)',
                background: statusFilter === 'excused' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.08)',
                color: '#60a5fa',
                padding:'5px 10px',
                borderRadius:'8px',
                fontWeight: 800,
                boxShadow: statusFilter === 'excused' ? '0 0 10px rgba(59, 130, 246, 0.3)' : 'none',
                transition: 'all 0.15s ease'
              }}
              title="تصفية أصحاب الأعذار فقط"
            >
              ● عذر: {countExcused}
            </button>

            {countUnrecorded > 0 && (
              <button 
                type="button"
                onClick={() => setStatusFilter(prev => prev === 'unrecorded' ? 'all' : 'unrecorded')}
                style={{
                  cursor:'pointer',
                  border: statusFilter === 'unrecorded' ? '2px solid #94a3b8' : '1px solid var(--border)',
                  background: statusFilter === 'unrecorded' ? 'rgba(148, 163, 184, 0.25)' : 'var(--bg)',
                  color: statusFilter === 'unrecorded' ? '#ffffff' : 'var(--text-muted)',
                  padding:'5px 10px',
                  borderRadius:'8px',
                  fontWeight: 800,
                  transition: 'all 0.15s ease'
                }}
                title="تصفية الطلاب الذين لم يتم رصدهم بعد"
              >
                لم يرصد: {countUnrecorded}
              </button>
            )}

            {pendingSyncCount > 0 && (
              <button
                type="button"
                onClick={syncPendingAttendance}
                disabled={syncingOffline}
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid #f59e0b',
                  color: '#f59e0b',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.82rem'
                }}
                title="مزامنة تسجيلات الغياب المعلقة مع السيرفر"
              >
                <RefreshCw size={13} style={{animation: syncingOffline ? 'spin 1s linear infinite' : 'none'}} />
                مزامنة ({pendingSyncCount})
              </button>
            )}
          </div>

          {/* Quick Actions & View Switcher */}
          <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
            <button 
              className="btn-primary" 
              onClick={handleManualSaveAttendance}
              style={{background:'var(--success)',borderColor:'var(--success)',fontSize:'0.85rem',padding:'6px 14px',fontWeight:800,display:'flex',alignItems:'center',gap:'6px'}}
              title="حفظ كشف الحضور والغياب فوراً في قاعدة البيانات"
            >
              💾 حفظ كشف الغياب الآن
            </button>
            <button 
              className="btn-secondary" 
              onClick={() => setBulkActionConfirm({
                type: 'present',
                title: 'تأكيد تحضير الكل',
                message: `هل أنت متأكد من تحضير جميع الطلاب المعروضين (${displayedEnrolledStudents.length} طالب) في هذا الكشف؟`,
                details: 'سيتم تعيين حالة جميع الطلاب المعروضين إلى (حاضر) لهذا الأسبوع وحفظها فوراً.',
                btnText: 'نعم، تحضير الكل الآن',
                btnColor: 'var(--success)',
                icon: 'check'
              })}
              style={{color:'var(--success)',borderColor:'rgba(16, 185, 129, 0.4)',background:'rgba(16, 185, 129, 0.08)',fontSize:'0.85rem',padding:'6px 12px',fontWeight:700}}
              title="تعيين جميع الطلاب المعروضين كـ حاضر دفعة واحدة"
            >
              <CheckCircle2 size={15} /> تحضير الكل
            </button>
            <button 
              className="btn-secondary" 
              onClick={() => setBulkActionConfirm({
                type: 'absent',
                title: 'تأكيد تغييب الكل',
                message: `هل أنت متأكد من تغييب جميع الطلاب المعروضين (${displayedEnrolledStudents.length} طالب) في هذا الكشف؟`,
                details: 'تنبيه: سيتم تعيين حالة جميع الطلاب المعروضين إلى (غائب) لهذا الأسبوع وحفظها فوراً.',
                btnText: 'نعم، تغييب الكل الآن',
                btnColor: 'var(--danger)',
                icon: 'x'
              })}
              style={{color:'var(--danger)',borderColor:'rgba(239, 68, 68, 0.4)',background:'rgba(239, 68, 68, 0.08)',fontSize:'0.85rem',padding:'6px 12px',fontWeight:700}}
              title="تعيين وتغييب جميع الطلاب المعروضين في هذا الكشف دفعة واحدة وحفظها في قاعدة البيانات"
            >
              <XCircle size={15} /> تغييب الكل
            </button>
            <button 
              className="btn-secondary" 
              onClick={() => setBulkActionConfirm({
                type: 'reset',
                title: 'تأكيد إعادة تعيين كشف الأسبوع',
                message: `هل أنت متأكد من إلغاء وتفريغ رصد الحضور لكافة الطلاب المعروضين (${displayedEnrolledStudents.length} طالب)؟`,
                details: 'سيتم إرجاع حالة جميع الطلاب في هذا الأسبوع إلى (غير مسجل) للبدء من جديد.',
                btnText: 'نعم، إعادة الضبط',
                btnColor: '#f59e0b',
                icon: 'rotate'
              })}
              style={{color:'var(--text-muted)',fontSize:'0.85rem',padding:'6px 10px'}}
              title="إعادة تعيين وإلغاء تحديد الحضور والغياب"
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
        <div id="manage-students-panel" className="panel fade-in" style={{marginBottom:'2rem',border:'2px solid var(--primary)',boxShadow:'0 0 25px rgba(79, 70, 229, 0.25)'}}>
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
                          {s.name} ({s.user_id}) - <strong style={{color:'var(--success)'}}>{getStudentSubSection(s, selectedSubject)}</strong>
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
                  transition:'all 0.15s ease',
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
                        {/* Removed profile section badge to prevent confusion */}
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

                {/* Section Participation Score Input (Sections only, and only if enabled for this subject) */}
                {attendanceType === 'section' && secPartConfig.enabled && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    margin: '8px 0',
                    padding: '6px 12px',
                    background: 'rgba(99, 102, 241, 0.05)',
                    borderRadius: '8px',
                    border: '1px solid rgba(99, 102, 241, 0.18)'
                  }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--primary-hover)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ⭐ درجة مشاركة السكشن:
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min="0"
                        max={secPartConfig.max}
                        step="0.5"
                        placeholder={String(secPartConfig.max)}
                        value={sectionScores[s.user_id] != null ? sectionScores[s.user_id] : ''}
                        onChange={(e) => handleUpdateSectionScore(s.user_id, e.target.value)}
                        style={{
                          width: '54px',
                          textAlign: 'center',
                          padding: '4px 6px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg)',
                          color: 'var(--text-main)',
                          fontWeight: 800,
                          fontSize: '0.92rem'
                        }}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>/ {secPartConfig.max}</span>
                    </div>
                  </div>
                )}

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
                {attendanceType === 'section' && secPartConfig.enabled && (
                  <th style={{padding:'12px 16px',textAlign:'center',width:'140px'}}>درجة السكشن (من {secPartConfig.max})</th>
                )}
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
                    {attendanceType === 'section' && secPartConfig.enabled && (
                      <td style={{padding:'8px 16px',textAlign:'center'}}>
                        <div style={{display:'inline-flex',alignItems:'center',gap:'4px'}}>
                          <input
                            type="number"
                            min="0"
                            max={secPartConfig.max}
                            step="0.5"
                            placeholder={String(secPartConfig.max)}
                            value={sectionScores[s.user_id] != null ? sectionScores[s.user_id] : ''}
                            onChange={(e) => handleUpdateSectionScore(s.user_id, e.target.value)}
                            style={{
                              width:'48px',
                              textAlign:'center',
                              padding:'4px 6px',
                              borderRadius:'4px',
                              border:'1px solid var(--border)',
                              background:'var(--bg)',
                              color:'var(--text-main)',
                              fontWeight:800,
                              fontSize:'0.85rem'
                            }}
                          />
                          <span style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>/{secPartConfig.max}</span>
                        </div>
                      </td>
                    )}
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

      {/* CUSTOM EXPORT MODAL (.TXT or .XLSX) */}
      {showExportModal && createPortal(
        <div 
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999, padding: 'clamp(1rem, 3vw, 2rem)', boxSizing: 'border-box'
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowExportModal(false); }}
        >
          <div className="panel fade-in" style={{maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(79, 70, 229, 0.35)', boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85)', borderRadius: '16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.2rem',borderBottom:'1px solid var(--border)',paddingBottom:'0.8rem'}}>
              <h3 style={{margin:0,fontSize:'1.2rem',display:'flex',alignItems:'center',gap:'8px',color:'var(--primary-hover)'}}>
                <Download size={20} /> خيارات تصدير كشف الغياب والحضور
              </h3>
              <button onClick={() => setShowExportModal(false)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>
                <X size={20} />
              </button>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:'1.2rem'}}>
              <div>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>1. صيغة ونوع الملف:</label>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))',gap:'10px'}}>
                  <label style={{
                    display:'flex',alignItems:'center',gap:'8px',padding:'10px',borderRadius:'8px',cursor:'pointer',
                    background: exportFormat === 'txt' ? 'rgba(79, 70, 229, 0.15)' : 'var(--bg)',
                    border: exportFormat === 'txt' ? '1px solid var(--primary)' : '1px solid var(--border)'
                  }}>
                    <input type="radio" name="exportFormat" value="txt" checked={exportFormat === 'txt'} onChange={() => setExportFormat('txt')} />
                    <FileText size={18} style={{color:'var(--primary-hover)'}} />
                    <span>ملف نصي (.txt)</span>
                  </label>

                  <label style={{
                    display:'flex',alignItems:'center',gap:'8px',padding:'10px',borderRadius:'8px',cursor:'pointer',
                    background: exportFormat === 'xlsx' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg)',
                    border: exportFormat === 'xlsx' ? '1px solid var(--success)' : '1px solid var(--border)'
                  }}>
                    <input type="radio" name="exportFormat" value="xlsx" checked={exportFormat === 'xlsx'} onChange={() => setExportFormat('xlsx')} />
                    <FileSpreadsheet size={18} style={{color:'var(--success)'}} />
                    <span>شيت إكسيل (.xlsx)</span>
                  </label>

                  <label style={{
                    display:'flex',alignItems:'center',gap:'8px',padding:'10px',borderRadius:'8px',cursor:'pointer',
                    background: exportFormat === 'pdf' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg)',
                    border: exportFormat === 'pdf' ? '1px solid #ef4444' : '1px solid var(--border)'
                  }}>
                    <input type="radio" name="exportFormat" value="pdf" checked={exportFormat === 'pdf'} onChange={() => setExportFormat('pdf')} />
                    <Printer size={18} style={{color:'#ef4444'}} />
                    <span>مستند طباعة (.pdf)</span>
                  </label>
                </div>
              </div>

              <div>
                <label style={{display:'block',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>2. الطلاب المطلوب تصديرهم:</label>
                <select className="input-field" value={exportFilter} onChange={e => setExportFilter(e.target.value)} style={{width:'100%',padding:'10px',fontWeight:700}}>
                  <option value="all">📋 الكشف الكامل (يتضمن من لم يرصد)</option>
                  <option value="recorded">🎯 المرصودون فقط (حاضر + غائب + عذر — استبعاد غير المرصودين) ({countPresent + countAbsent + countLate + countExcused} طالب)</option>
                  <option value="present">🟢 الحاضرون فقط ({countPresent} طالب)</option>
                  <option value="absent">🔴 الغائبون فقط ({countAbsent} طالب)</option>
                  <option value="late">🟡 المتأخرون فقط ({countLate} طالب)</option>
                  <option value="excused">🔵 أصحاب الأعذار فقط ({countExcused} طالب)</option>
                </select>
              </div>

              <div style={{borderTop:'1px solid var(--border)',paddingTop:'1rem'}}>
                <label style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'6px',fontSize:'0.9rem',fontWeight:700}}>
                  <span>3. إضافة طالب من مجموعة أخرى لهذا الكشف (اختياري):</span>
                  {exportExtraStudents.length > 0 && (
                    <span className="badge" style={{background:'rgba(16, 185, 129, 0.15)',color:'var(--success)',fontSize:'0.75rem'}}>
                      تمت إضافة {exportExtraStudents.length} طالب
                    </span>
                  )}
                </label>
                <p style={{margin:'0 0 8px 0',fontSize:'0.8rem',color:'var(--text-muted)'}}>
                  إذا حضر طالب من المجموعة الأخرى اليوم، ابحث عنه هنا لإدراجه كـ (حاضر) في هذا الملف المُصدّر فقط دون التأثير على القوائم الرئيسية.
                </p>

                {/* Search Box */}
                <div style={{position:'relative',marginBottom:'8px'}}>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="ابحث بالاسم أو الرقم الأكاديمي لإضافته للكشف..."
                    value={extraStudentSearch}
                    onChange={e => setExtraStudentSearch(e.target.value)}
                    style={{width:'100%',padding:'8px 12px',fontSize:'0.85rem'}}
                  />
                  {extraStudentSearch.trim().length >= 2 && (
                    <div style={{
                      position:'absolute',
                      top:'100%',
                      left:0,
                      right:0,
                      background:'var(--bg)',
                      border:'1px solid var(--primary)',
                      borderRadius:'8px',
                      maxHeight:'160px',
                      overflowY:'auto',
                      zIndex:1000,
                      boxShadow:'0 8px 24px rgba(0,0,0,0.6)'
                    }}>
                      {availableExtraCandidates.slice(0, 8).map(stu => (
                        <div
                          key={stu.user_id}
                          onClick={() => handleAddExtraStudent(stu)}
                          style={{
                            padding:'8px 12px',
                            borderBottom:'1px solid var(--border)',
                            cursor:'pointer',
                            display:'flex',
                            justifyContent:'space-between',
                            alignItems:'center',
                            fontSize:'0.85rem'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(79, 70, 229, 0.15)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div>
                            <strong>{stu.name}</strong>
                            <span style={{color:'var(--text-muted)',fontSize:'0.75rem',marginRight:'6px'}}>({stu.user_id})</span>
                          </div>
                          <span className="badge" style={{fontSize:'0.72rem'}}>
                            {attendanceType === 'lecture' ? `مجموعة ${getStudentLectureGroup(stu, selectedSubject)}` : getStudentSubSection(stu, selectedSubject)}
                          </span>
                        </div>
                      ))}
                      {availableExtraCandidates.length === 0 && (
                        <div style={{padding:'10px',textAlign:'center',color:'var(--text-muted)',fontSize:'0.85rem'}}>
                          لم يتم العثور على طالب مطابق
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* List of Extra Students Added */}
                {exportExtraStudents.length > 0 && (
                  <div style={{display:'flex',flexDirection:'column',gap:'6px',marginBottom:'10px'}}>
                    {exportExtraStudents.map(stu => (
                      <div key={stu.user_id} style={{
                        display:'flex',
                        alignItems:'center',
                        justifyContent:'space-between',
                        background:'rgba(79, 70, 229, 0.08)',
                        border:'1px solid rgba(79, 70, 229, 0.25)',
                        padding:'6px 10px',
                        borderRadius:'6px',
                        fontSize:'0.85rem'
                      }}>
                        <div style={{display:'flex',alignItems:'center',gap:'6px',overflow:'hidden'}}>
                          <span style={{fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'160px'}}>{stu.name}</span>
                          <span className="badge" style={{fontSize:'0.7rem',background:'rgba(245, 158, 11, 0.15)',color:'#fbbf24'}}>
                            {stu.nativeGroup ? `مجموعة ${stu.nativeGroup}` : stu.nativeSection}
                          </span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                          <select
                            className="input-field"
                            value={stu.status}
                            onChange={e => handleUpdateExtraStatus(stu.user_id, e.target.value)}
                            style={{padding:'3px 8px',fontSize:'0.8rem'}}
                          >
                            <option value="present">حاضر ✓</option>
                            <option value="late">تأخير 🟡</option>
                            <option value="excused">عذر 🔵</option>
                            <option value="absent">غائب 🔴</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveExtraStudent(stu.user_id)}
                            style={{background:'none',border:'none',color:'var(--danger)',cursor:'pointer',padding:'2px'}}
                            title="إلغاء الإضافة من الكشف"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.8rem',color:'var(--text-muted)',cursor:'pointer',marginTop:'4px'}}>
                      <input
                        type="checkbox"
                        checked={saveExtraAttendanceToDb}
                        onChange={e => setSaveExtraAttendanceToDb(e.target.checked)}
                      />
                      <span>حفظ حضورهم أيضاً في قاعدة بيانات المنصة لهذا الأسبوع</span>
                    </label>
                  </div>
                )}
              </div>

              <div style={{display:'flex',gap:'10px',marginTop:'0.5rem'}}>
                <button className="btn-primary" onClick={handleExecuteCustomExport} style={{flex:1,padding:'10px',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}>
                  <Download size={18} /> تحميل الملف الآن
                </button>
                <button className="btn-secondary" onClick={() => setShowExportModal(false)}>
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* PDF EXPORT LOADING MODAL */}
      {pdfExportLoading && createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '16px'
        }}>
          <div style={{
            background: '#1e293b',
            color: '#ffffff',
            padding: '26px 30px',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
            maxWidth: '340px',
            width: '100%',
            textAlign: 'center',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{
              width: '42px',
              height: '42px',
              border: '3.5px solid rgba(13, 148, 136, 0.25)',
              borderTopColor: '#0d9488',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }} />
            <div style={{fontWeight: 700, fontSize: '15.5px', color: '#f8fafc'}}>
              جاري تجهيز وتحميل كشف PDF...
            </div>
            <div style={{fontSize: '12px', color: '#94a3b8', lineHeight: 1.5}}>
              لحظات وسيبدأ التنزيل تلقائياً على جهازك بنفس التنسيق المعتمد
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* FLOATING PDF DOWNLOAD NOTIFICATION & 1-CLICK PREVIEW */}
      {downloadedPdfInfo && createPortal(
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 999999,
          background: '#1e293b',
          color: '#ffffff',
          padding: '16px 20px',
          borderRadius: '14px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '92vw',
          width: '450px',
          border: '1.5px solid #10b981'
        }}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div style={{display:'flex', alignItems:'center', gap:'8px', fontWeight:'700', fontSize:'14.5px', color:'#10b981'}}>
              <span style={{fontSize:'18px'}}>✅</span>
              <span>تم تنزيل كشف الغياب بنجاح على جهازك!</span>
            </div>
            <button 
              onClick={() => setDownloadedPdfInfo(null)} 
              style={{background:'none', border:'none', color:'#94a3b8', fontSize:'20px', cursor:'pointer', padding:'0 4px', lineHeight:1}}
              title="إغلاق"
            >
              ✕
            </button>
          </div>

          <div style={{fontSize:'11.5px', color:'#cbd5e1', wordBreak:'break-all', direction:'ltr', textAlign:'right', background:'#0f172a', padding:'8px 10px', borderRadius:'6px', border:'1px solid #334155'}}>
            📄 {downloadedPdfInfo.filename}
          </div>

          <div style={{display:'flex', gap:'8px'}}>
            <button
              onClick={() => {
                window.open(downloadedPdfInfo.blobUrl, '_blank');
              }}
              style={{
                flex: 1,
                backgroundColor: '#0d9488',
                color: '#ffffff',
                border: 'none',
                padding: '10px 14px',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              <span>👁️</span>
              <span>فتح ومعاينة الكشف فوراً</span>
            </button>

            {typeof navigator !== 'undefined' && navigator.canShare && (
              <button
                onClick={async () => {
                  try {
                    const file = new File([downloadedPdfInfo.blob], downloadedPdfInfo.filename, { type: 'application/pdf' });
                    if (navigator.canShare({ files: [file] })) {
                      await navigator.share({
                        files: [file],
                        title: downloadedPdfInfo.filename,
                        text: 'كشف غياب وحضور الطلاب'
                      });
                    }
                  } catch (err) {
                    if (err.name !== 'AbortError') console.warn('Share error:', err);
                  }
                }}
                style={{
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>📤</span>
                <span>مشاركة</span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* EXCUSE REASON MODAL */}
      {excuseModalStudent && createPortal(
        <div 
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999, padding: 'clamp(1rem, 3vw, 2rem)', boxSizing: 'border-box'
          }}
          onClick={e => { if (e.target === e.currentTarget) setExcuseModalStudent(null); }}
        >
          <div className="panel fade-in" style={{maxWidth: '460px', width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(59, 130, 246, 0.4)', boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85)', borderRadius: '16px'}}>
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
        </div>,
        document.body
      )}


      {/* Attendance Excel Import Modal */}
      {showImportAttendanceModal && createPortal(
        <div 
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
            zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(1rem, 3vw, 2rem)', boxSizing: 'border-box'
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowImportAttendanceModal(false); }}
        >
          <div className="panel fade-in" style={{maxWidth:'780px',width:'100%',maxHeight:'90vh',overflowY:'auto',padding:'2rem',borderRadius:'16px',position:'relative',border:'1px solid rgba(79, 70, 229, 0.35)',boxShadow:'0 25px 60px -15px rgba(0, 0, 0, 0.85)'}}>
            <button onClick={() => setShowImportAttendanceModal(false)} style={{position:'absolute',top:'16px',left:'16px',background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>
              <X size={22} />
            </button>

            <h3 style={{margin:'0 0 8px 0',fontSize:'1.3rem',color:'var(--primary-hover)',display:'flex',alignItems:'center',gap:'8px'}}>
              <FileSpreadsheet size={24} /> استيراد ورصد الغياب من ملف Excel
            </h3>
            <p className="text-muted" style={{margin:'0 0 1.2rem 0',fontSize:'0.88rem'}}>
              يمكنك رفع ملف إكسيل يحتوي على أرقام الطلاب الأكاديمية (ID) وقيم الغياب لرصد كافة الأسابيع دفعة واحدة:
            </p>

            {/* Instruction Guide Diagram */}
            <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'10px',padding:'14px',marginBottom:'1.3rem',fontSize:'0.83rem'}}>
              <div style={{fontWeight:700,color:'var(--text-main)',marginBottom:'8px'}}>📋 التنسيق المطلوب للأعمدة في ملف Excel:</div>
              <div style={{overflowX:'auto',fontFamily:'monospace',background:'rgba(0,0,0,0.2)',padding:'8px',borderRadius:'6px',color:'#38bdf8',marginBottom:'8px'}}>
                | Section | ID | Name | Section 1 | Section 2 | Section 3 | ...
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px',fontSize:'0.8rem',color:'var(--text-muted)'}}>
                <span>● <strong style={{color:'var(--success)'}}>1</strong> = حاضر ✓</span>
                <span>● <strong style={{color:'var(--danger)'}}>0</strong> = غائب ✗</span>
                <span>● <strong style={{color:'var(--warning)'}}>2</strong> = تأخير ⏱️</span>
                <span>● <strong style={{color:'#3b82f6'}}>E</strong> = عذر 🔵</span>
              </div>
            </div>

            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.3rem'}}>
              <span style={{fontSize:'0.85rem',color:'var(--text-muted)'}}>هل تريد نموذجاً جاهزاً بأعمدة المادة والطلاب؟</span>
              <button 
                className="btn-secondary" 
                onClick={handleDownloadAttendanceTemplate}
                style={{padding:'6px 12px',fontSize:'0.82rem',color:'var(--success)',borderColor:'rgba(16,185,129,0.3)',display:'flex',alignItems:'center',gap:'5px'}}
              >
                <Download size={14} /> تحميل نموذج جاهز (.xlsx)
              </button>
            </div>

            <div style={{marginBottom:'1.2rem'}}>
              <label style={{display:'block',marginBottom:'8px',fontWeight:700,fontSize:'0.9rem'}}>اختر ملف الإكسيل (.xlsx / .xls):</label>
              <input 
                type="file" 
                accept=".xlsx, .xls"
                onChange={e => handleAttendanceFileSelect(e.target.files[0] || null)}
                className="input-field" 
                style={{padding:'8px'}}
              />
            </div>

            {/* Multi-Sheet Detection & Preview */}
            {importDetectedSheets.length > 0 && (
              <div style={{background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px',marginBottom:'1.3rem'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                  <span style={{fontWeight:700,fontSize:'0.92rem',display:'flex',alignItems:'center',gap:'6px',color:'var(--primary-hover)'}}>
                    <Layers size={18} />
                    {importDetectedSheets.length > 1 
                      ? `تم اكتشاف ملف متعدد المواد (${importDetectedSheets.length} شيتات):`
                      : 'تم فحص الشيت بنجاح:'}
                  </span>
                  <span style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>
                    إجمالي {importDetectedSheets.reduce((acc, sh) => acc + (sh.records?.length || 0), 0)} طالب
                  </span>
                </div>

                {importDetectedSheets.length > 1 && (
                  <div style={{display:'flex',flexWrap:'wrap',gap:'15px',marginBottom:'12px',background:'var(--bg)',padding:'10px 14px',borderRadius:'8px',border:'1px solid var(--border)'}}>
                    <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.85rem',fontWeight:700,cursor:'pointer',color:importAllSheetsMode ? 'var(--primary-hover)' : 'var(--text-main)'}}>
                      <input 
                        type="radio" 
                        name="importMode" 
                        checked={importAllSheetsMode} 
                        onChange={() => setImportAllSheetsMode(true)} 
                      />
                      ⚡ استيراد جميع الشيتات والمواد دفعة واحدة (تلقائي)
                    </label>
                    <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.85rem',fontWeight:700,cursor:'pointer',color:!importAllSheetsMode ? 'var(--primary-hover)' : 'var(--text-main)'}}>
                      <input 
                        type="radio" 
                        name="importMode" 
                        checked={!importAllSheetsMode} 
                        onChange={() => setImportAllSheetsMode(false)} 
                      />
                      📄 استيراد شيت واحد فقط
                    </label>
                  </div>
                )}

                <div style={{display:'flex',flexDirection:'column',gap:'8px',maxHeight:'220px',overflowY:'auto',paddingRight:'4px'}}>
                  {importDetectedSheets.map((sh, sIdx) => {
                    const isSelected = importAllSheetsMode || selectedImportSheetIndex === sIdx;
                    return (
                      <div 
                        key={sIdx}
                        onClick={() => { if (!importAllSheetsMode) setSelectedImportSheetIndex(sIdx); }}
                        style={{
                          display:'flex',
                          flexWrap:'wrap',
                          alignItems:'center',
                          justifyContent:'space-between',
                          gap:'10px',
                          padding:'8px 12px',
                          borderRadius:'8px',
                          background: isSelected ? 'rgba(79, 70, 229, 0.08)' : 'var(--bg)',
                          border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                          cursor: !importAllSheetsMode ? 'pointer' : 'default',
                          transition:'all 0.2s'
                        }}
                      >
                        <div style={{display:'flex',alignItems:'center',gap:'8px',minWidth:'140px'}}>
                          <span style={{fontWeight:700,fontSize:'0.88rem',color:'var(--text-main)'}}>
                            📄 {sh.sheetName}
                          </span>
                          <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                            ({sh.records.length} طالب • {sh.weeksDetected.length} أسابيع)
                          </span>
                        </div>

                        <div style={{display:'flex',alignItems:'center',gap:'6px',flex:1,justifyContent:'flex-end'}}>
                          <span style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>المادة:</span>
                          <select 
                            value={sh.targetSubjectId}
                            onChange={(e) => handleUpdateSheetSubject(sIdx, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="input-field"
                            style={{padding:'4px 8px',fontSize:'0.82rem',maxWidth:'240px'}}
                          >
                            {(allSystemSubjects.length > 0 ? allSystemSubjects : subjects).map(sub => (
                              <option key={sub.id} value={sub.id}>
                                {sub.name}
                              </option>
                            ))}
                          </select>
                          {sh.isAutoMatched && (
                            <span title="تم التعرف على المادة تلقائياً" style={{color:'var(--success)',fontSize:'0.9rem',fontWeight:'bold'}}>✓</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Multi-Week & Section Date Configuration */}
            {importDetectedSheets.length > 0 && (
              <div style={{
                background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.85))',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '1.3rem',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.25)'
              }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px',flexWrap:'wrap',gap:'8px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <Calendar size={18} style={{color:'var(--primary-hover)'}} />
                    <span style={{fontWeight:800,fontSize:'0.95rem',color:'var(--primary-hover)'}}>
                      تحديد وتخصيص تواريخ الرصد (لكل مادة، أسبوع، وسكشن):
                    </span>
                  </div>
                  <span style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>
                    يمكنك تحديد تاريخ عام للأسبوع أو تاريخ مستقل لكل سكشن على حدة
                  </span>
                </div>

                {/* If multiple sheets, allow choosing which sheet's dates to view/edit */}
                {importDetectedSheets.length > 1 && (
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px',overflowX:'auto',paddingBottom:'4px'}}>
                    <span style={{fontSize:'0.8rem',color:'var(--text-muted)',whiteSpace:'nowrap',fontWeight:700}}>
                      📄 المادة / الشيت:
                    </span>
                    {importDetectedSheets.map((sh, sIdx) => {
                      const isActiveSheet = activeDateConfigSheetIdx === sIdx;
                      return (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => {
                            setActiveDateConfigSheetIdx(sIdx);
                            const weeks = sh.weeksDetected?.length > 0 ? sh.weeksDetected : [week];
                            if (!weeks.includes(activeDateConfigWeek)) {
                              setActiveDateConfigWeek(weeks[0]);
                            }
                          }}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: isActiveSheet ? '1px solid var(--primary)' : '1px solid var(--border)',
                            background: isActiveSheet ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                            color: isActiveSheet ? '#fff' : 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s'
                          }}
                        >
                          {sh.sheetName} ({sh.targetSubjectName || 'المادة'})
                        </button>
                      );
                    })}
                  </div>
                )}

                {(() => {
                  const activeSheet = importDetectedSheets[activeDateConfigSheetIdx] || importDetectedSheets[0];
                  if (!activeSheet) return null;
                  const detectedWeeks = activeSheet.weeksDetected?.length > 0 ? activeSheet.weeksDetected : [week];
                  const currentWeekCfg = importDatesConfig[activeDateConfigSheetIdx]?.[activeDateConfigWeek] || {
                    generalDate: sessionDate,
                    perSection: false,
                    sections: {}
                  };
                  const detectedSecs = activeSheet.detectedSections?.length > 0 ? activeSheet.detectedSections : ['S1', 'S2', 'S3', 'S4'];

                  return (
                    <div>
                      {/* Week selector bar */}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px',flexWrap:'wrap',gap:'6px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'6px',overflowX:'auto',paddingBottom:'2px',flex:1}}>
                          <span style={{fontSize:'0.8rem',color:'var(--text-muted)',fontWeight:700}}>الأسابيع:</span>
                          {detectedWeeks.map(wNum => {
                            const isSelectedWeek = activeDateConfigWeek === wNum;
                            const isCustomSec = importDatesConfig[activeDateConfigSheetIdx]?.[wNum]?.perSection;
                            return (
                              <button
                                key={wNum}
                                type="button"
                                onClick={() => setActiveDateConfigWeek(wNum)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  border: isSelectedWeek ? '1px solid #38bdf8' : '1px solid var(--border)',
                                  background: isSelectedWeek ? 'rgba(56, 189, 248, 0.2)' : 'rgba(0,0,0,0.2)',
                                  color: isSelectedWeek ? '#38bdf8' : 'var(--text-muted)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px'
                                }}
                              >
                                <span>أسبوع {wNum}</span>
                                {isCustomSec && (
                                  <span style={{width:'6px',height:'6px',borderRadius:'50%',background:'#38bdf8'}} title="مخصص لكل سكشن" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {detectedWeeks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleCopyDatesToAllWeeks(activeDateConfigSheetIdx, activeDateConfigWeek)}
                            className="btn-secondary"
                            style={{padding:'4px 9px',fontSize:'0.75rem',color:'var(--primary-hover)',display:'flex',alignItems:'center',gap:'4px'}}
                            title="تطبيق نفس إعدادات وتواريخ هذا الأسبوع على جميع أسابيع هذا الشيت"
                          >
                            <span>⚡ تطبيق على كافة الأسابيع</span>
                          </button>
                        )}
                      </div>

                      {/* Active Week Settings Box */}
                      <div style={{background:'rgba(0,0,0,0.3)',border:'1px solid var(--border)',borderRadius:'10px',padding:'12px'}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'10px',marginBottom:'10px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                            <label style={{fontSize:'0.84rem',fontWeight:700,color:'var(--text-main)',display:'flex',alignItems:'center',gap:'6px'}}>
                              <Calendar size={15} style={{color:'#38bdf8'}} />
                              تاريخ أسبوع {activeDateConfigWeek} العام:
                            </label>
                            <input 
                              type="date" 
                              value={currentWeekCfg.generalDate || sessionDate}
                              onChange={(e) => handleUpdateGeneralDate(activeDateConfigSheetIdx, activeDateConfigWeek, e.target.value)}
                              className="input-field"
                              style={{padding:'4px 8px',fontSize:'0.82rem',width:'145px'}}
                            />
                          </div>

                          {/* Per-Section Toggle for Section Attendance */}
                          {attendanceType === 'section' && (
                            <label style={{
                              display:'flex',alignItems:'center',gap:'6px',fontSize:'0.82rem',fontWeight:700,cursor:'pointer',
                              color: currentWeekCfg.perSection ? 'var(--primary-hover)' : 'var(--text-muted)',
                              background: currentWeekCfg.perSection ? 'rgba(79, 70, 229, 0.15)' : 'transparent',
                              padding: '4px 8px', borderRadius: '6px', border: currentWeekCfg.perSection ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent'
                            }}>
                              <input 
                                type="checkbox" 
                                checked={Boolean(currentWeekCfg.perSection)}
                                onChange={() => handleTogglePerSection(activeDateConfigSheetIdx, activeDateConfigWeek)}
                              />
                              <span>🎯 تخصيص تاريخ لكل سكشن على حدة ({detectedSecs.join(', ')})</span>
                            </label>
                          )}
                        </div>

                        {/* Per-Section Date Grid */}
                        {attendanceType === 'section' && currentWeekCfg.perSection && (
                          <div style={{
                            background: 'rgba(79, 70, 229, 0.06)',
                            border: '1px dashed rgba(99, 102, 241, 0.4)',
                            borderRadius: '8px',
                            padding: '12px',
                            marginTop: '8px'
                          }}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                              <span style={{fontSize:'0.8rem',color:'var(--primary-hover)',fontWeight:700}}>
                                📌 تواريخ انعقاد السكاشن في أسبوع {activeDateConfigWeek}:
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddManualSection(activeDateConfigSheetIdx)}
                                style={{background:'none',border:'none',color:'#38bdf8',fontSize:'0.76rem',fontWeight:700,cursor:'pointer',textDecoration:'underline'}}
                              >
                                + إضافة سكشن يدوي
                              </button>
                            </div>

                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                              gap: '8px'
                            }}>
                              {detectedSecs.map(sec => {
                                const secDate = currentWeekCfg.sections?.[sec] || currentWeekCfg.generalDate || sessionDate;
                                return (
                                  <div key={sec} style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'6px',padding:'6px 8px'}}>
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}>
                                      <span style={{fontWeight:800,fontSize:'0.8rem',color:'var(--text-main)'}}>
                                        سكشن {sec}
                                      </span>
                                    </div>
                                    <input 
                                      type="date"
                                      value={secDate}
                                      onChange={(e) => handleUpdateSectionDate(activeDateConfigSheetIdx, activeDateConfigWeek, sec, e.target.value)}
                                      className="input-field"
                                      style={{padding:'3px 6px',fontSize:'0.78rem',width:'100%',boxSizing:'border-box'}}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {importAttendanceStatus && (
              <div style={{
                background: importAttendanceStatus.startsWith('❌') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(79, 70, 229, 0.1)',
                color: importAttendanceStatus.startsWith('❌') ? 'var(--danger)' : 'var(--primary-hover)',
                border: importAttendanceStatus.startsWith('❌') ? '1px solid var(--danger)' : '1px solid var(--primary)',
                padding:'10px 14px',borderRadius:'8px',marginBottom:'1.2rem',fontSize:'0.88rem',fontWeight:700
              }}>
                {importAttendanceStatus}
              </div>
            )}

            <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
              <button 
                className="btn-secondary" 
                onClick={() => {
                  setShowImportAttendanceModal(false);
                  setImportAttendanceFile(null);
                  setImportDetectedSheets([]);
                  setImportDatesConfig({});
                  setImportAttendanceStatus('');
                }} 
                disabled={importingAttendance}
              >
                إلغاء
              </button>
              <button 
                className="btn-primary" 
                onClick={handleProcessAttendanceImport} 
                disabled={!importAttendanceFile || importingAttendance}
                style={{display:'flex',alignItems:'center',gap:'8px'}}
              >
                <FileSpreadsheet size={16} /> {importingAttendance ? 'جاري الاستيراد...' : 'رفع ورصد الغياب فوراً'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── SMART ATTENDANCE CLONE MODAL ──────────────────────────────────────── */}
      {showCloneModal && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 999999, padding: 'clamp(1rem, 3vw, 2rem)', boxSizing: 'border-box'
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowCloneModal(false); }}
        >
          <div
            className="panel fade-in"
            style={{
              maxWidth: '660px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
              border: '1px solid rgba(13, 148, 136, 0.45)',
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.9)',
              borderRadius: '18px', padding: '0'
            }}
          >
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(13,148,136,0.2), rgba(6,95,70,0.15))',
              borderBottom: '1px solid rgba(13,148,136,0.3)',
              padding: '1.4rem 1.8rem',
              borderRadius: '18px 18px 0 0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
            }}>
              <div>
                <h3 style={{margin: 0, fontSize: '1.25rem', color: '#2dd4bf', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800}}>
                  <Copy size={22} /> 📋 نسخ الحضور الذكي من محاضرة أخرى
                </h3>
                <p style={{margin: '6px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)'}}>
                  سيتم نسخ حالة الحضور تلقائياً إلى: <strong style={{color: '#2dd4bf'}}>{currentSub?.name || ''}</strong> — الأسبوع <strong style={{color: '#2dd4bf'}}>{week}</strong>
                </p>
              </div>
              <button onClick={() => setShowCloneModal(false)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',padding:'4px'}}>
                <X size={22} />
              </button>
            </div>

            <div style={{padding: '1.6rem 1.8rem', display: 'flex', flexDirection: 'column', gap: '1.4rem'}}>

              {/* Step 1: Select Source Subject */}
              <div style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '1.1rem 1.3rem'
              }}>
                <div style={{fontSize: '0.78rem', color: '#2dd4bf', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '0.8rem', textTransform: 'uppercase'}}>
                  الخطوة 1 — اختر المادة والأسبوع المصدر
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
                  <div>
                    <label style={{display:'block', marginBottom:'6px', fontSize:'0.85rem', fontWeight:700}}>المادة المصدر:</label>
                    <select
                      className="input-field"
                      value={cloneSourceSubject}
                      onChange={e => { setCloneSourceSubject(e.target.value); setClonePreview(null); }}
                      style={{width: '100%'}}
                    >
                      <option value="">-- اختر المادة --</option>
                      {allSystemSubjects
                        .filter(s => s.id !== selectedSubject)
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} (فرقة {normalizeYear(s.year_level)})
                          </option>
                        ))
                      }
                    </select>
                  </div>
                  <div>
                    <label style={{display:'block', marginBottom:'6px', fontSize:'0.85rem', fontWeight:700}}>الأسبوع المصدر:</label>
                    <select
                      className="input-field"
                      value={cloneSourceWeek}
                      onChange={e => { setCloneSourceWeek(Number(e.target.value)); setClonePreview(null); }}
                      style={{width: '100%'}}
                    >
                      {Array.from({length: currentSub?.total_weeks || 12}, (_, i) => i + 1).map(w => (
                        <option key={w} value={w}>الأسبوع {w} ({formatDisplayDate(getWeekDefaultDate(w))})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{marginTop: '10px'}}>
                  <label style={{display:'block', marginBottom:'6px', fontSize:'0.85rem', fontWeight:700}}>نوع الكشف المصدر:</label>
                  <div style={{display: 'flex', gap: '10px'}}>
                    {[
                      {val: 'lecture', label: '🏛️ محاضرة'},
                      {val: 'section', label: '🏢 سكشن'}
                    ].map(opt => (
                      <label key={opt.val} style={{
                        display: 'flex', alignItems: 'center', gap: '7px',
                        padding: '7px 14px', borderRadius: '8px', cursor: 'pointer',
                        background: cloneSourceType === opt.val ? 'rgba(13,148,136,0.15)' : 'var(--surface)',
                        border: cloneSourceType === opt.val ? '1px solid #0d9488' : '1px solid var(--border)',
                        fontWeight: cloneSourceType === opt.val ? 800 : 500,
                        color: cloneSourceType === opt.val ? '#2dd4bf' : 'var(--text-muted)',
                        fontSize: '0.88rem'
                      }}>
                        <input
                          type="radio"
                          name="cloneSourceType"
                          value={opt.val}
                          checked={cloneSourceType === opt.val}
                          onChange={() => { setCloneSourceType(opt.val); setClonePreview(null); }}
                          style={{display:'none'}}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
                <button
                  className="btn-primary"
                  onClick={handleLoadClonePreview}
                  disabled={!cloneSourceSubject || cloneLoading}
                  style={{
                    marginTop: '12px', width: '100%', background: '#0d9488',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '8px', padding: '9px', fontSize: '0.92rem', fontWeight: 800
                  }}
                >
                  {cloneLoading
                    ? <><RefreshCw size={16} style={{animation:'spin 1s linear infinite'}} /> جاري تحليل البيانات...</>
                    : <><Search size={16} /> تحليل ومعاينة التطابق</>
                  }
                </button>
              </div>

              {/* Preview Results */}
              {clonePreview && (
                <>
                  {/* Summary Cards */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '10px'
                  }}>
                    <div style={{
                      background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.3)',
                      borderRadius: '10px', padding: '12px', textAlign: 'center'
                    }}>
                      <div style={{fontSize: '1.8rem', fontWeight: 900, color: '#2dd4bf'}}>{clonePreview.matched.length}</div>
                      <div style={{fontSize: '0.78rem', color: '#2dd4bf', fontWeight: 700, marginTop: '2px'}}>✅ طالب مشترك</div>
                      <div style={{fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px'}}>سيتم نسخ حالتهم تلقائياً</div>
                    </div>
                    <div style={{
                      background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                      borderRadius: '10px', padding: '12px', textAlign: 'center'
                    }}>
                      <div style={{fontSize: '1.8rem', fontWeight: 900, color: '#f59e0b'}}>{clonePreview.onlyInTarget.length}</div>
                      <div style={{fontSize: '0.78rem', color: '#f59e0b', fontWeight: 700, marginTop: '2px'}}>⚠️ طالب في المادة الحالية فقط</div>
                      <div style={{fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px'}}>يحتاجون قرار منك</div>
                    </div>
                    <div style={{
                      background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.25)',
                      borderRadius: '10px', padding: '12px', textAlign: 'center'
                    }}>
                      <div style={{fontSize: '1.8rem', fontWeight: 900, color: '#94a3b8'}}>{clonePreview.onlyInSource.length}</div>
                      <div style={{fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, marginTop: '2px'}}>⏭️ طالب في المصدر فقط</div>
                      <div style={{fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px'}}>سيتم تجاهلهم تلقائياً</div>
                    </div>
                  </div>

                  {/* Matched Students Preview */}
                  {clonePreview.matched.length > 0 && (
                    <div style={{
                      background: 'var(--bg)', border: '1px solid var(--border)',
                      borderRadius: '12px', padding: '1.1rem 1.3rem'
                    }}>
                      <div style={{fontSize: '0.78rem', color: '#2dd4bf', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '0.8rem', textTransform: 'uppercase'}}>
                        الطلاب المشتركون — سيُنسخ حضورهم تلقائياً
                      </div>
                      <div style={{maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px'}}>
                        {clonePreview.matched.map(stu => {
                          const st = stu.srcStatus;
                          const stColor = st === 'present' ? 'var(--success)' : st === 'absent' ? 'var(--danger)' : st === 'late' ? 'var(--warning)' : st === 'excused' ? '#3b82f6' : 'var(--text-muted)';
                          const stLabel = st === 'present' ? '✔ حاضر' : st === 'absent' ? '✗ غائب' : st === 'late' ? '⏱ تأخير' : st === 'excused' ? '🔵 عذر' : '— لم يرصد';
                          return (
                            <div key={stu.user_id} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '6px 10px', borderRadius: '7px',
                              background: 'var(--surface)', border: '1px solid var(--border)',
                              fontSize: '0.84rem'
                            }}>
                              <span style={{color: 'var(--text-main)', fontWeight: 600}}>{stu.name} <span style={{color:'var(--text-muted)',fontWeight:400}}>({stu.user_id})</span></span>
                              <span style={{color: stColor, fontWeight: 800, fontSize: '0.8rem'}}>{stLabel}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Target-only Students: Decision Panel */}
                  {clonePreview.onlyInTarget.length > 0 && (
                    <div style={{
                      background: 'rgba(245,158,11,0.06)',
                      border: '1px solid rgba(245,158,11,0.35)',
                      borderRadius: '12px', padding: '1.1rem 1.3rem'
                    }}>
                      <div style={{fontSize: '0.78rem', color: '#f59e0b', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '0.8rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '7px'}}>
                        <AlertCircle size={14} /> الطلاب غير الموجودين في المادة المصدر — اختر ما يناسبهم
                      </div>
                      {/* Default action picker */}
                      <div style={{display: 'flex', gap: '8px', marginBottom: '0.9rem', flexWrap: 'wrap'}}>
                        {[
                          {val: 'absent', label: '✗ غائبون افتراضياً', color: 'var(--danger)', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.4)'},
                          {val: 'present', label: '✔ حاضرون افتراضياً', color: 'var(--success)', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.4)'},
                          {val: 'manual', label: '✏️ تحديد فردي لكل طالب', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)'},
                        ].map(opt => (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() => setCloneDefaultForExtra(opt.val)}
                            style={{
                              padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 800, fontSize: '0.83rem',
                              color: opt.color,
                              background: cloneDefaultForExtra === opt.val ? opt.bg : 'var(--surface)',
                              border: cloneDefaultForExtra === opt.val ? '2px solid ' + opt.border : '1px solid var(--border)',
                              transition: 'all 0.15s'
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* Student list with individual controls */}
                      <div style={{maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px'}}>
                        {clonePreview.onlyInTarget.map(stu => {
                          const curChoice = cloneDefaultForExtra === 'manual'
                            ? (cloneManualExtra[stu.user_id] || '')
                            : cloneDefaultForExtra;
                          const stColor = curChoice === 'present' ? 'var(--success)' : curChoice === 'absent' ? 'var(--danger)' : curChoice === 'late' ? 'var(--warning)' : 'var(--text-muted)';
                          return (
                            <div key={stu.user_id} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '7px 10px', borderRadius: '7px',
                              background: 'var(--surface)', border: '1px solid var(--border)',
                              fontSize: '0.84rem', gap: '8px'
                            }}>
                              <span style={{color: 'var(--text-main)', fontWeight: 600, flex: 1}}>
                                {stu.name}
                                <span style={{color:'var(--text-muted)',fontWeight:400}}> ({stu.user_id})</span>
                                <span style={{
                                  marginRight: '8px',
                                  fontSize: '0.72rem',
                                  padding: '2px 6px', borderRadius: '4px',
                                  background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700
                                }}>في المادة الحالية فقط</span>
                              </span>
                              {cloneDefaultForExtra === 'manual' ? (
                                <div style={{display: 'flex', gap: '4px'}}>
                                  {[
                                    {val: 'present', label: 'حاضر', color: 'var(--success)'},
                                    {val: 'absent', label: 'غائب', color: 'var(--danger)'},
                                    {val: 'late', label: 'تأخير', color: 'var(--warning)'},
                                  ].map(btn => (
                                    <button
                                      key={btn.val}
                                      type="button"
                                      onClick={() => setCloneManualExtra(prev => ({...prev, [stu.user_id]: btn.val}))}
                                      style={{
                                        padding: '3px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                                        color: btn.color,
                                        background: cloneManualExtra[stu.user_id] === btn.val ? 'rgba(0,0,0,0.25)' : 'transparent',
                                        border: cloneManualExtra[stu.user_id] === btn.val ? '1px solid ' + btn.color : '1px solid var(--border)',
                                      }}
                                    >{btn.label}</button>
                                  ))}
                                </div>
                              ) : (
                                <span style={{color: stColor, fontWeight: 800, fontSize: '0.8rem', minWidth: '55px', textAlign: 'center'}}>
                                  {curChoice === 'present' ? '✔ حاضر' : curChoice === 'absent' ? '✗ غائب' : '⏱ تأخير'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Apply Button */}
                  <div style={{display: 'flex', gap: '10px'}}>
                    <button
                      className="btn-primary"
                      onClick={handleApplyClone}
                      disabled={cloneApplying || (cloneDefaultForExtra === 'manual' && clonePreview.onlyInTarget.some(s => !cloneManualExtra[s.user_id]))}
                      style={{
                        flex: 1, background: '#0d9488', padding: '11px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '8px', fontSize: '0.95rem', fontWeight: 800
                      }}
                    >
                      {cloneApplying
                        ? <><RefreshCw size={16} style={{animation:'spin 1s linear infinite'}} /> جاري تطبيق النسخ...</>
                        : <><Check size={18} /> تطبيق النسخ الذكي الآن</>
                      }
                    </button>
                    <button className="btn-secondary" onClick={() => setShowCloneModal(false)} style={{padding: '11px 20px'}}>
                      إلغاء
                    </button>
                  </div>

                  {cloneDefaultForExtra === 'manual' && clonePreview.onlyInTarget.some(s => !cloneManualExtra[s.user_id]) && (
                    <div style={{
                      background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)',
                      color: '#f59e0b', padding: '8px 12px', borderRadius: '8px',
                      fontSize: '0.83rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '7px'
                    }}>
                      <AlertCircle size={14} />
                      يرجى تحديد الحالة لجميع الطلاب الإضافيين ({clonePreview.onlyInTarget.filter(s => !cloneManualExtra[s.user_id]).length} طالب متبقي)
                    </div>
                  )}
                </>
              )}

              {/* Empty state when no preview loaded yet */}
              {!clonePreview && !cloneLoading && (
                <div style={{
                  textAlign: 'center', padding: '1.5rem',
                  color: 'var(--text-muted)', fontSize: '0.88rem',
                  border: '1px dashed var(--border)', borderRadius: '10px'
                }}>
                  <Copy size={32} style={{opacity: 0.3, marginBottom: '8px'}} />
                  <div>اختر المادة المصدر والأسبوع ثم اضغط "تحليل ومعاينة التطابق"</div>
                  <div style={{marginTop: '5px', fontSize: '0.78rem', color: '#94a3b8'}}>
                    سيتم عرض قائمة تفصيلية بالطلاب المشتركين والطلاب الإضافيين قبل أي تغيير
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* BULK ACTION CONFIRMATION MODAL */}
      {bulkActionConfirm && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--card-bg, #1e293b)',
            border: '1px solid var(--border, #334155)',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            direction: 'rtl',
            color: 'var(--text, #f8fafc)'
          }}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px'}}>
              <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                <div style={{
                  background: bulkActionConfirm.type === 'present' ? 'rgba(16, 185, 129, 0.2)' : bulkActionConfirm.type === 'absent' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: bulkActionConfirm.btnColor,
                  padding: '10px',
                  borderRadius: '12px',
                  display: 'flex'
                }}>
                  {bulkActionConfirm.type === 'present' && <CheckCircle2 size={24} />}
                  {bulkActionConfirm.type === 'absent' && <XCircle size={24} />}
                  {bulkActionConfirm.type === 'reset' && <RotateCcw size={24} />}
                </div>
                <h3 style={{margin:0, fontSize:'1.2rem', fontWeight:800}}>
                  {bulkActionConfirm.title}
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setBulkActionConfirm(null)}
                style={{background:'none', border:'none', color:'var(--text-muted, #94a3b8)', cursor:'pointer', padding:'4px'}}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{fontSize:'1rem', lineHeight:1.6, margin:'0 0 12px 0', fontWeight:600}}>
              {bulkActionConfirm.message}
            </p>

            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border, #334155)',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '0.85rem',
              color: 'var(--text-muted, #94a3b8)',
              marginBottom: '20px',
              lineHeight: 1.5
            }}>
              💡 {bulkActionConfirm.details}
            </div>

            <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setBulkActionConfirm(null)}
                style={{padding:'10px 18px', fontWeight:700}}
              >
                إلغاء الأمر
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={executeBulkAction}
                style={{
                  background: bulkActionConfirm.btnColor,
                  borderColor: bulkActionConfirm.btnColor,
                  color: '#fff',
                  padding: '10px 22px',
                  fontWeight: 800,
                  fontSize: '0.95rem'
                }}
              >
                {bulkActionConfirm.btnText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
