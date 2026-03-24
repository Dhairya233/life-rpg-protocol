'use client';
// app/login/page.tsx
// ============================================================
// THE LIFE-RPG PROTOCOL — Auth Gateway
// Handles Login and Sign Up with themed UI + error toasts.
// ============================================================

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams }                  from 'next/navigation';
import { motion, AnimatePresence }                     from 'framer-motion';
import ThemeToggle                                     from '@/components/ThemeToggle';
import Toast                                           from '@/components/Toast';
import { useTheme }                                    from '@/context/ThemeContext';
import { signIn, signUp, supabase }                   from '@/lib/supabase';

// ── TYPES ──────────────────────────────────────────────────────
type AuthMode = 'login' | 'signup';

interface FormState {
  email:    string;
  password: string;
  username: string; // signup only
  confirm:  string; // signup only
}

interface ToastState {
  visible:  boolean;
  message:  string;
  type:     'error' | 'success' | 'warning' | 'info';
}

// ── VALIDATION ─────────────────────────────────────────────────
function validate(mode: AuthMode, form: FormState): string | null {
  if (!form.email.trim())    return 'Email is required.';
  if (!/\S+@\S+\.\S+/.test(form.email)) return 'Enter a valid email address.';
  if (!form.password)        return 'Password is required.';
  if (form.password.length < 8) return 'Password must be at least 8 characters.';

  if (mode === 'signup') {
    if (!form.username.trim()) return 'Username is required.';
    if (form.username.length < 3) return 'Username must be at least 3 characters.';
    if (!/^[a-zA-Z0-9_]+$/.test(form.username))
      return 'Username can only contain letters, numbers, and underscores.';
    if (form.password !== form.confirm) return 'Passwords do not match.';
  }
  return null;
}

// ── FLOATING PARTICLES (classic mode only) ─────────────────────
function Particles() {
  const DOTS = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x:  Math.random() * 100,
    y:  Math.random() * 100,
    size: 1 + Math.random() * 2,
    dur:  6 + Math.random() * 8,
    delay: Math.random() * 5,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {DOTS.map(d => (
        <motion.div
          key={d.id}
          className="absolute rounded-full"
          style={{
            left:            `${d.x}%`,
            top:             `${d.y}%`,
            width:           d.size,
            height:          d.size,
            backgroundColor: '#4af7ff',
            boxShadow:       '0 0 4px #4af7ff',
          }}
          animate={{
            y:       [0, -30, 0],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration:   d.dur,
            delay:      d.delay,
            repeat:     Infinity,
            ease:       'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// ── INPUT COMPONENT ────────────────────────────────────────────
interface InputProps {
  label:       string;
  type?:       string;
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?:   boolean;
  isClassic:   boolean;
}

function AuthInput({ label, type = 'text', value, onChange, placeholder, autoComplete, disabled, isClassic }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-widest font-semibold opacity-50"
        style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all disabled:opacity-50"
          style={{
            background:   'var(--bg-secondary)',
            border:       `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
            color:        'var(--text-primary)',
            fontFamily:   'var(--font-body)',
            boxShadow:    isClassic && focused
              ? '0 0 0 3px rgba(74,247,255,0.12), 0 0 12px rgba(74,247,255,0.08)'
              : isClassic ? 'none'
              : focused   ? '0 0 0 3px rgba(0,113,227,0.12)'
              : 'none',
          }}
        />
      </div>
    </div>
  );
}

// ── PASSWORD STRENGTH ──────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const strength = checks.filter(Boolean).length;
  const labels   = ['Weak', 'Fair', 'Good', 'Strong'];
  const colors   = ['#ff3355', '#ffd700', '#4af7ff', '#69ff96'];

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[0,1,2,3].map(i => (
          <motion.div
            key={i}
            className="h-1 flex-1 rounded-full"
            animate={{ backgroundColor: i < strength ? colors[strength - 1] : 'rgba(255,255,255,0.08)' }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>
      {strength > 0 && (
        <p className="text-xs" style={{ color: colors[strength - 1] }}>
          {labels[strength - 1]} password
        </p>
      )}
    </div>
  );
}

// ── INNER COMPONENT (uses useSearchParams) ─────────────────────
function LoginContent() {
  const { isClassic }   = useTheme();
  const router          = useRouter();
  const searchParams    = useSearchParams();
  const nextPath        = searchParams.get('next') ?? '/dashboard';

  const [mode,     setMode]     = useState<AuthMode>('login');
  const [loading,  setLoading]  = useState(false);
  const [form,     setForm]     = useState<FormState>({ email: '', password: '', username: '', confirm: '' });
  const [toast,    setToast]    = useState<ToastState>({ visible: false, message: '', type: 'error' });
  const [confirmed, setConfirmed] = useState(false); // signup confirmation state

  // If user is already logged in, bounce to dashboard
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace('/dashboard');
    });
  }, [router]);

  const showToast = useCallback((message: string, type: ToastState['type'] = 'error') => {
    setToast({ visible: true, message, type });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  const set = (field: keyof FormState) => (value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // ── SUBMIT ─────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const validationError = validate(mode, form);
    if (validationError) { showToast(validationError, 'warning'); return; }

    setLoading(true);
    dismissToast();

    if (mode === 'login') {
      const { error } = await signIn(form.email.trim(), form.password);
      if (error) {
        setLoading(false);
        // Map Supabase errors to user-friendly messages
        if (error.toLowerCase().includes('invalid login'))
          showToast('Invalid email or password. Try again.', 'error');
        else if (error.toLowerCase().includes('email not confirmed'))
          showToast('Please confirm your email before logging in.', 'warning');
        else
          showToast(error, 'error');
        return;
      }
      router.push(nextPath);

    } else {
      const { error, needsConfirmation } = await signUp(
        form.email.trim(),
        form.password,
        form.username,
      );
      setLoading(false);
      if (error) {
        if (error.toLowerCase().includes('already registered'))
          showToast('That email is already registered. Try logging in.', 'warning');
        else
          showToast(error, 'error');
        return;
      }
      if (needsConfirmation) {
        setConfirmed(true);
      } else {
        router.push('/dashboard');
      }
    }
  }, [mode, form, router, nextPath, showToast, dismissToast]);

  // Allow Enter key to submit
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) handleSubmit();
  }, [handleSubmit, loading]);

  // ── CONFIRMATION SCREEN ────────────────────────────────────
  if (confirmed) {
    return (
      <motion.div
        className="flex flex-col items-center gap-5 text-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 240 }}
      >
        <motion.div
          className="text-6xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 0.5 }}
        >
          📬
        </motion.div>
        <div>
          <h2 className="font-black text-2xl display-font"
            style={{ color: 'var(--accent)', textShadow: isClassic ? '0 0 12px var(--accent-glow)' : 'none' }}>
            Check Your Inbox
          </h2>
          <p className="text-sm opacity-60 mt-2 max-w-xs leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}>
            We sent a confirmation link to <strong style={{ color: 'var(--text-primary)' }}>{form.email}</strong>.
            Confirm it to activate your character.
          </p>
        </div>
        <button
          onClick={() => { setConfirmed(false); setMode('login'); }}
          className="px-6 py-2.5 rounded-xl text-sm font-bold uppercase tracking-widest border transition-all hover:opacity-80"
          style={{ borderColor: 'var(--border-accent)', color: 'var(--accent)' }}
        >
          Back to Login
        </button>
      </motion.div>
    );
  }

  // ── MAIN CARD CONTENT ──────────────────────────────────────
  return (
    <div className="flex flex-col gap-6" onKeyDown={handleKeyDown}>

      {/* Toast */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={dismissToast}
      />

      {/* Mode tabs */}
      <div className="flex rounded-xl p-1 gap-1" style={{ background: 'var(--bg-secondary)' }}>
        {(['login', 'signup'] as AuthMode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); dismissToast(); }}
            className="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
            style={{
              background: mode === m ? 'var(--accent)' : 'transparent',
              color:      mode === m ? '#000' : 'var(--text-secondary)',
              boxShadow:  isClassic && mode === m ? '0 0 12px var(--accent-glow)66' : 'none',
            }}
          >
            {m === 'login' ? '⚡ Login' : '✦ Sign Up'}
          </button>
        ))}
      </div>

      {/* Form fields */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          className="flex flex-col gap-4"
          initial={{ opacity: 0, x: mode === 'login' ? -16 : 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: mode === 'login' ? 16 : -16 }}
          transition={{ duration: 0.2 }}
        >
          {mode === 'signup' && (
            <AuthInput
              label="Username"
              value={form.username}
              onChange={set('username')}
              placeholder="null_byte_99"
              autoComplete="username"
              disabled={loading}
              isClassic={isClassic}
            />
          )}

          <AuthInput
            label="Email"
            type="email"
            value={form.email}
            onChange={set('email')}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={loading}
            isClassic={isClassic}
          />

          <div className="space-y-2">
            <AuthInput
              label="Password"
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              disabled={loading}
              isClassic={isClassic}
            />
            {mode === 'signup' && <PasswordStrength password={form.password} />}
          </div>

          {mode === 'signup' && (
            <AuthInput
              label="Confirm Password"
              type="password"
              value={form.confirm}
              onChange={set('confirm')}
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={loading}
              isClassic={isClassic}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Submit button */}
      <motion.button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-widest display-font transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: 'var(--accent)',
          color:      '#000',
          boxShadow:  isClassic ? '0 0 20px var(--accent-glow)55' : 'none',
        }}
        whileHover={!loading ? { scale: 1.02 } : {}}
        whileTap={!loading ? { scale: 0.98 } : {}}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              className="inline-block w-4 h-4 border-2 rounded-full border-t-transparent"
              style={{ borderColor: '#000', borderTopColor: 'transparent' }}
            />
            {mode === 'login' ? 'Authenticating...' : 'Creating Character...'}
          </span>
        ) : (
          mode === 'login' ? 'Enter the Protocol ⚡' : 'Create Character ✦'
        )}
      </motion.button>

      {/* Divider + sign-up prompt */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        <span className="text-xs opacity-30" style={{ color: 'var(--text-secondary)' }}>
          {mode === 'login' ? 'New here?' : 'Have an account?'}
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
      </div>

      <button
        onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); dismissToast(); }}
        className="text-sm font-semibold text-center transition-all hover:opacity-80"
        style={{ color: 'var(--accent)' }}
      >
        {mode === 'login' ? '✦ Create a character' : '⚡ Log in instead'}
      </button>
    </div>
  );
}

// ── PAGE WRAPPER ───────────────────────────────────────────────
export default function LoginPage() {
  const { isClassic } = useTheme();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Classic: scanline + particles */}
      {isClassic && (
        <>
          {/* Grid */}
          <div
            className="fixed inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(rgba(74,247,255,0.025) 1px, transparent 1px),
                linear-gradient(90deg, rgba(74,247,255,0.025) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
            }}
          />
          {/* Glow blobs */}
          <div className="fixed top-1/4 -left-24 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none"
            style={{ background: '#4af7ff' }} />
          <div className="fixed bottom-1/4 -right-24 w-64 h-64 rounded-full blur-3xl opacity-10 pointer-events-none"
            style={{ background: '#b47aff' }} />
          <Particles />
        </>
      )}

      {/* Modern: subtle gradient */}
      {!isClassic && (
        <div className="fixed inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,113,227,0.06) 0%, transparent 70%)' }}
        />
      )}

      <div className="relative z-10 w-full max-w-md space-y-6">

        {/* ── Top bar ─────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div>
            <h1
              className="display-font font-black text-2xl tracking-wider"
              style={{
                color: 'var(--accent)',
                textShadow: isClassic ? '0 0 16px var(--accent-glow)' : 'none',
              }}
            >
              LIFE•RPG
            </h1>
            <p className="text-xs opacity-30 tracking-widest uppercase"
              style={{ color: 'var(--text-secondary)' }}>
              The Protocol
            </p>
          </div>
          <ThemeToggle />
        </div>

        {/* ── Auth card ───────────────────────────────────── */}
        <motion.div
          className="rounded-3xl p-7 w-full"
          style={{
            background:  'var(--bg-card)',
            border:      '1px solid var(--border)',
            boxShadow:   isClassic
              ? '0 0 0 1px var(--border), 0 0 60px rgba(74,247,255,0.05), inset 0 1px 0 rgba(74,247,255,0.05)'
              : '0 8px 40px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
          }}
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0,  scale: 1   }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          {/* Card header */}
          <div className="mb-6 text-center">
            <motion.div
              className="text-4xl mb-3"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              ⚔
            </motion.div>
            <h2 className="font-black text-xl display-font"
              style={{
                color: 'var(--text-primary)',
                textShadow: isClassic ? '0 0 8px rgba(74,247,255,0.2)' : 'none',
              }}>
              Auth Gateway
            </h2>
            <p className="text-xs opacity-40 mt-1 tracking-widest uppercase"
              style={{ color: 'var(--text-secondary)' }}>
              Prove your identity, warrior
            </p>
          </div>

          {/* useSearchParams must be inside Suspense */}
          <Suspense fallback={<div className="h-48" />}>
            <LoginContent />
          </Suspense>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-xs opacity-20" style={{ color: 'var(--text-secondary)' }}>
          THE LIFE-RPG PROTOCOL · SPRINT 2.5 · AUTH GATEWAY
        </p>
      </div>
    </div>
  );
}
