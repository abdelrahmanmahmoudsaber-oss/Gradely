import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          background: '#0a0f1d',
          color: '#ffffff',
          fontFamily: "'Cairo', sans-serif",
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.6rem', color: '#f87171' }}>حدث تنبيه أثناء تحميل الصفحة</h2>
          <p style={{ maxWidth: '600px', color: '#94a3b8', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {this.state.error?.message || 'تعذر تحميل الصفحة بشكل صحيح.'}
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.href = '/';
              }}
              style={{
                background: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🔄 تسجيل الدخول من جديد
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              تحديث الصفحة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
