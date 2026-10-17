// app/dashboard/loading.tsx
import React from 'react';

export default function DashboardLoading() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: '16px'
    }}>
      <div className="spinner" style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        border: '3px solid var(--border)',
        borderTopColor: 'var(--accent)',
        animation: 'spin 1s linear infinite'
      }} />
      <p className="display-font" style={{ color: 'var(--text-secondary)' }}>Loading Interface...</p>
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
