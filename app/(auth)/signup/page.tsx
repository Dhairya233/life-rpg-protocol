'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signUp } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { Swords, User, Mail, Lock, ArrowRight, Sparkles } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const { isClassic } = useTheme();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      setLoading(false);
      return;
    }

    const result = await signUp(email, password, username);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (result.needsConfirmation) {
      setSuccess(true);
    } else {
      router.push('/dashboard');
      router.refresh();
    }

    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo">
            <Swords size={28} />
          </div>
          <h1 className="display-font auth-title">JOIN THE PROTOCOL</h1>
          <p className="auth-subtitle">Create your character. Begin your legend.</p>
        </div>

        {success ? (
          <div className="auth-success">
            <Sparkles size={32} style={{ color: 'var(--accent)' }} />
            <h2 className="display-font" style={{ fontSize: '1.1rem', marginTop: '12px' }}>
              Check Your Email
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '0.9rem' }}>
              We sent a confirmation link to <strong>{email}</strong>.<br />
              Click it to activate your account and begin.
            </p>
            <Link href="/login" className="auth-link" style={{ marginTop: '20px' }}>
              Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            {/* Username */}
            <div className="auth-field">
              <label className="auth-label">
                <User size={14} />
                <span>USERNAME</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_legend_name"
                required
                className="auth-input"
                autoComplete="username"
              />
            </div>

            {/* Email */}
            <div className="auth-field">
              <label className="auth-label">
                <Mail size={14} />
                <span>EMAIL</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="warrior@example.com"
                required
                className="auth-input"
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="auth-field">
              <label className="auth-label">
                <Lock size={14} />
                <span>PASSWORD</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
                minLength={6}
                className="auth-input"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="auth-error">{error}</div>
            )}

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? (
                <span className="auth-btn-loading">Creating character...</span>
              ) : (
                <>
                  <span>Begin Your Journey</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        )}

        <div className="auth-footer">
          Already have an account?{' '}
          <Link href="/login" className="auth-link">Sign In</Link>
        </div>
      </div>

      <style jsx>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-primary);
          padding: 2rem;
        }
        .auth-card {
          width: 100%;
          max-width: 420px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 2.5rem 2rem;
          ${isClassic ? 'box-shadow: 0 0 60px rgba(74, 247, 255, 0.06), inset 0 1px 0 rgba(74, 247, 255, 0.08);' : 'box-shadow: 0 8px 40px rgba(0,0,0,0.08);'}
        }
        .auth-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        .auth-logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: var(--accent-soft);
          color: var(--accent);
          margin-bottom: 16px;
          ${isClassic ? 'box-shadow: 0 0 20px rgba(74, 247, 255, 0.2);' : ''}
        }
        .auth-title {
          font-size: 1.3rem;
          color: var(--text-primary);
          margin: 0;
        }
        .auth-subtitle {
          color: var(--text-secondary);
          font-size: 0.85rem;
          margin-top: 6px;
          font-family: var(--font-body);
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .auth-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .auth-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: var(--text-secondary);
          font-family: var(--font-body);
        }
        .auth-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 0.9rem;
          font-family: var(--font-body);
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .auth-input:focus {
          border-color: var(--accent);
          ${isClassic ? 'box-shadow: 0 0 0 3px rgba(74, 247, 255, 0.1);' : 'box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.1);'}
        }
        .auth-input::placeholder {
          color: var(--text-muted);
        }
        .auth-error {
          padding: 10px 14px;
          border-radius: 8px;
          background: rgba(255, 100, 100, 0.1);
          border: 1px solid rgba(255, 100, 100, 0.2);
          color: #ff6b6b;
          font-size: 0.82rem;
          font-family: var(--font-body);
        }
        .auth-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 13px;
          border-radius: 10px;
          border: none;
          background: var(--accent);
          color: ${isClassic ? '#080c14' : '#ffffff'};
          font-size: 0.9rem;
          font-weight: 600;
          font-family: var(--font-body);
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 4px;
        }
        .auth-btn:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
          ${isClassic ? 'box-shadow: 0 4px 20px rgba(74, 247, 255, 0.3);' : 'box-shadow: 0 4px 20px rgba(0, 113, 227, 0.3);'}
        }
        .auth-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .auth-btn-loading {
          opacity: 0.8;
        }
        .auth-footer {
          text-align: center;
          margin-top: 20px;
          font-size: 0.82rem;
          color: var(--text-secondary);
          font-family: var(--font-body);
        }
        .auth-link {
          color: var(--accent);
          text-decoration: none;
          font-weight: 500;
        }
        .auth-link:hover {
          text-decoration: underline;
        }
        .auth-success {
          text-align: center;
          padding: 1rem 0;
        }
      `}</style>
    </div>
  );
}
