import React from 'react';

export default function Alert({ type = 'success', message, onClose }) {
  if (!message) return null;
  const isSuccess = type === 'success';
  return (
    <div className={`alert ${isSuccess ? 'alert-success' : 'alert-danger'}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>{isSuccess ? '✅' : '⚠️'} {message}</span>
      {onClose && (
        <button 
          onClick={onClose} 
          style={{ 
            background: 'none', border: 'none', color: 'inherit', 
            fontSize: '1.2rem', cursor: 'pointer', opacity: 0.7, fontWeight: 700 
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
