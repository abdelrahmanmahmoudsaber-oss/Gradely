import React, { useState } from 'react';
import Alert from '../components/common/Alert';

const bgImage = '/gradely_logo.png';

export default function LoginPage({ onLogin, error, clearError, loading }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(username, password);
  };

  const fillTA = () => {
    setUsername('abdo');
    setPassword('abdo');
    clearError();
  };

  const fillStudent = () => {
    setUsername('1001');
    setPassword('1001');
    clearError();
  };

  return (
    <div className="login-page" style={{ backgroundImage: `url(${bgImage})` }}>
      <div className="login-left">
        <h1 className="login-brand-name">Gradely</h1>
        <p className="login-brand-tagline">Academic Management Portal</p>
      </div>
      <div className="login-right">
        <div className="login-card">
          <h1>Sign In</h1>
          <p className="login-subtitle">Enter your academic credentials below</p>

          <Alert type="danger" message={error} onClose={clearError} />

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username / Student ID</label>
              <input
                placeholder="e.g. abdo or 1001"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1.75rem' }}>
              <label>Password</label>
              <input
                type="password"
                placeholder="••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', fontSize: '0.95rem' }}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In →'}
            </button>
          </form>

          {/* Quick Demo Helpers */}
          <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
              💡 Quick Access Demo Accounts
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button onClick={fillTA} className="btn btn-outline btn-sm">
                TA (abdo)
              </button>
              <button onClick={fillStudent} className="btn btn-outline btn-sm">
                Student (1001)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
