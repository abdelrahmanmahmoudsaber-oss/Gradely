import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { ShieldAlert, RefreshCw, Search, Filter, History, Clock, User, ArrowRight, Eye, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function AuditLogsTab({ user }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [tableFilter, setTableFilter] = useState('all'); // 'all', 'grades', 'attendance', 'users'
  const [actionFilter, setActionFilter] = useState('all'); // 'all', 'INSERT', 'UPDATE', 'DELETE'
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    fetchAuditLogs();
  }, [tableFilter, actionFilter]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError('');

      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (tableFilter !== 'all') {
        query = query.eq('table_name', tableFilter);
      }

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      const { data, error: fetchErr } = await query;

      if (fetchErr) {
        throw fetchErr;
      }

      setLogs(data || []);
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

  // Compare old and new data to extract diffs
  const getDiffDescription = (log) => {
    if (log.action === 'INSERT') {
      const studentId = log.new_data?.student_id || log.new_data?.user_id || log.record_id || '';
      return `إضافة سجل جديد ${studentId ? `للطالب (${studentId})` : ''}`;
    }
    if (log.action === 'DELETE') {
      const studentId = log.old_data?.student_id || log.old_data?.user_id || log.record_id || '';
      return `حذف السجل ${studentId ? `الخاص بـ (${studentId})` : ''}`;
    }
    if (log.action === 'UPDATE' && log.old_data && log.new_data) {
      const changedKeys = [];
      const ignored = ['updated_at', 'id', 'created_at'];
      for (const k of Object.keys(log.new_data)) {
        if (!ignored.includes(k) && JSON.stringify(log.old_data[k]) !== JSON.stringify(log.new_data[k])) {
          changedKeys.push({
            key: k,
            oldVal: log.old_data[k],
            newVal: log.new_data[k]
          });
        }
      }
      if (changedKeys.length === 0) return 'تعديل طفيف في بيانات السجل';
      return changedKeys.map(c => `${c.key}: (${c.oldVal ?? 'فارغ'} ⬅️ ${c.newVal ?? 'فارغ'})`).join(' | ');
    }
    return 'تعديل في السجل';
  };

  // Filter logs by search term
  const filteredLogs = logs.filter(l => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase().trim();
    const actor = (l.actor_user_id || '').toLowerCase();
    const table = (l.table_name || '').toLowerCase();
    const recId = (l.record_id || '').toLowerCase();
    const desc = getDiffDescription(l).toLowerCase();
    return actor.includes(term) || table.includes(term) || recId.includes(term) || desc.includes(term);
  });

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
            سجل دقيق ومحمي ضد الحذف يسجل بالثانية أي تعديل على الدرجات، الغياب، والبيانات ومن قام به.
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

      {/* Error alert if table not ready */}
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '14px 18px', borderRadius: '10px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertTriangle size={20} />
          <div>
            <strong>تنبيه:</strong> {error}
          </div>
        </div>
      )}

      {/* Control Bar: Search & Filters */}
      <div className="panel" style={{ padding: '1.2rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 260px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={18} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text"
              placeholder="ابحث برقم المستخدم / المعيد / الطالب..."
              className="input-field"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', paddingRight: '38px', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Table Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>القسم:</span>
          {['all', 'grades', 'attendance', 'users'].map(tabKey => (
            <button
              key={tabKey}
              onClick={() => setTableFilter(tabKey)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: tableFilter === tabKey ? 'var(--primary-hover)' : 'var(--border)',
                background: tableFilter === tabKey ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                color: tableFilter === tabKey ? 'var(--primary-hover)' : 'var(--text-muted)',
                transition: 'all 0.2s'
              }}
            >
              {tabKey === 'all' ? 'الكل' : getTableLabel(tabKey)}
            </button>
          ))}
        </div>

        {/* Action Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>العملية:</span>
          {['all', 'UPDATE', 'INSERT', 'DELETE'].map(actKey => (
            <button
              key={actKey}
              onClick={() => setActionFilter(actKey)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: actionFilter === actKey ? 'var(--primary-hover)' : 'var(--border)',
                background: actionFilter === actKey ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                color: actionFilter === actKey ? 'var(--primary-hover)' : 'var(--text-muted)',
                transition: 'all 0.2s'
              }}
            >
              {actKey === 'all' ? 'الكل' : actKey === 'UPDATE' ? 'تعديل' : actKey === 'INSERT' ? 'إضافة' : 'حذف'}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Table */}
      <div className="panel" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'spin 1s linear infinite' }}>⏳</div>
            جاري فحص وتحديث سجل العمليات...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <History size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <h3 style={{ margin: '0 0 6px 0', color: 'var(--text-main)' }}>لا توجد عمليات مسجلة حتى الآن</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              سيتم تسجيل أي عملية تعديل على الدرجات أو رصد الغياب فور حدوثها في هذا السجل تلقائياً.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>الوقت والتاريخ</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>منفّذ العملية</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>نوع العملية</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>القسم</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>التفاصيل الدقيقة</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>معاينة</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
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
                          <span>{log.actor_user_id || 'مستخدم غير معروف'}</span>
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        {getActionBadge(log.action)}
                      </td>

                      <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                        {getTableLabel(log.table_name)}
                      </td>

                      <td style={{ padding: '14px 16px', color: 'var(--text-main)', maxWidth: '420px', lineHeight: 1.5 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px', wordBreak: 'break-all' }}>
                          {getDiffDescription(log)}
                        </span>
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
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedLog(null); }}
        >
          <div className="panel fade-in" style={{ maxWidth: '650px', width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '1.8rem', position: 'relative' }}>
            <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <span>🔍 تفاصيل العملية المسجلة</span>
              <button onClick={() => setSelectedLog(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '1.5rem', fontSize: '0.88rem' }}>
              <div><strong>منفّذ العملية:</strong> {selectedLog.actor_user_id || 'غير معروف'}</div>
              <div><strong>نوع العملية:</strong> {getActionBadge(selectedLog.action)}</div>
              <div><strong>الجدول:</strong> {getTableLabel(selectedLog.table_name)}</div>
              <div><strong>الوقت:</strong> {new Date(selectedLog.created_at).toLocaleString('ar-EG')}</div>
            </div>

            <div style={{ marginBottom: '1.2rem' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#f87171' }}>البيانات قبل التعديل (Old Data):</h4>
              <pre style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', overflowX: 'auto', direction: 'ltr', color: '#94a3b8' }}>
                {JSON.stringify(selectedLog.old_data, null, 2) || 'لا توجد بيانات سابقة (سجل جديد)'}
              </pre>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#34d399' }}>البيانات بعد التعديل (New Data):</h4>
              <pre style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', overflowX: 'auto', direction: 'ltr', color: '#94a3b8' }}>
                {JSON.stringify(selectedLog.new_data, null, 2) || 'تم حذف السجل'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
