'use client';
// components/FocusTimer.tsx
// ============================================================
// THE LIFE-RPG PROTOCOL — Focus Timer ("The Jail")
//
// States: idle → active → warning → failed | success
//
// Failure triggers:
//   • Page hidden (visibilitychange) for > HIDDEN_GRACE_MS (10s)
//   • Mouse leaves window (mouseleave on document)
//   • Tab blurred (window blur)
//
// On failure: deduct 5 Aura via Supabase
// On success: unlock <ProofUpload>
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { deductAura } from '@/lib/supabase';

// ── CONFIG ──────────────────────────────────────────────────
const HIDDEN_GRACE_MS   = 10_000;   // 10 s hidden before fail
const AURA_PENALTY      = 5;        // aura deducted on failure
const WARNING_COOLDOWN  = 3_000;    // ms before warning clears if user returns

// ── TYPES ───────────────────────────────────────────────────
type TimerState = 'idle' | 'active' | 'warning' | 'failed' | 'success';

interface FocusTimerProps {
  userId:       string;
  questId:      string;
  durationSecs: number;             // how long the focus session runs
  questTitle?:  string;
  onSuccess:    () => void;         // called when timer completes cleanly
  onFailure?:   (newAura: number | null) => void;
}

// ── HELPERS ─────────────────────────────────────────────────
function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── COMPONENT ───────────────────────────────────────────────
export default function FocusTimer({
  userId,
  questId,
  durationSecs,
  questTitle = 'Focus Session',
  onSuccess,
  onFailure,
}: FocusTimerProps) {
  const { isClassic } = useTheme();

  const [state,        setState]        = useState<TimerState>('idle');
  const [remaining,    setRemaining]    = useState(durationSecs);
  const [warningMsg,   setWarningMsg]   = useState('');
  const [penaltyAura,  setPenaltyAura]  = useState<number | null>(null);

  // Refs — avoid stale closures inside event listeners
  const stateRef           = useRef<TimerState>('idle');
  const hiddenSinceRef     = useRef<number | null>(null);
  const hiddenTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef       = useRef(durationSecs);

  // Keep refs in sync
  const updateState = useCallback((s: TimerState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // ── FAILURE HANDLER ────────────────────────────────────────
  const triggerFailure = useCallback(async (reason: string) => {
    if (stateRef.current === 'failed' || stateRef.current === 'success') return;

    // Stop countdown
    if (countdownRef.current) clearInterval(countdownRef.current);
    updateState('failed');
    setWarningMsg(reason);

    // Deduct aura
    const newAura = await deductAura(userId, AURA_PENALTY);
    setPenaltyAura(newAura);
    onFailure?.(newAura);
  }, [userId, onFailure, updateState]);

  // ── SUCCESS HANDLER ────────────────────────────────────────
  const triggerSuccess = useCallback(() => {
    if (stateRef.current === 'failed') return;
    if (countdownRef.current) clearInterval(countdownRef.current);
    updateState('success');
    onSuccess();
  }, [onSuccess, updateState]);

  // ── WARN (recoverable) ─────────────────────────────────────
  const triggerWarning = useCallback((msg: string) => {
    if (stateRef.current !== 'active') return;
    updateState('warning');
    setWarningMsg(msg);
  }, [updateState]);

  const clearWarning = useCallback(() => {
    if (stateRef.current === 'warning') {
      updateState('active');
      setWarningMsg('');
    }
  }, [updateState]);

  // ── START SESSION ──────────────────────────────────────────
  const startSession = useCallback(() => {
    remainingRef.current = durationSecs;
    setRemaining(durationSecs);
    updateState('active');

    countdownRef.current = setInterval(() => {
      remainingRef.current -= 1;
      setRemaining(remainingRef.current);

      if (remainingRef.current <= 0) {
        clearInterval(countdownRef.current!);
        triggerSuccess();
      }
    }, 1000);
  }, [durationSecs, triggerSuccess, updateState]);

  // ── CLEANUP on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      if (countdownRef.current)  clearInterval(countdownRef.current);
      if (hiddenTimerRef.current) clearTimeout(hiddenTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, []);

  // ── PAGE VISIBILITY API ────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (stateRef.current !== 'active' && stateRef.current !== 'warning') return;

      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now();
        triggerWarning('Tab hidden — return within 10 seconds or fail!');

        // Grace period timer
        hiddenTimerRef.current = setTimeout(() => {
          if (document.visibilityState === 'hidden') {
            triggerFailure('You left for too long. Aura penalty applied.');
          }
        }, HIDDEN_GRACE_MS);
      } else {
        // Tab came back
        if (hiddenTimerRef.current) {
          clearTimeout(hiddenTimerRef.current);
          hiddenTimerRef.current = null;
        }
        hiddenSinceRef.current = null;
        clearWarning();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [triggerWarning, triggerFailure, clearWarning]);

  // ── WINDOW BLUR / MOUSE LEAVE ──────────────────────────────
  useEffect(() => {
    const handleBlur = () => {
      if (stateRef.current !== 'active') return;
      triggerWarning('Window lost focus — stay on task!');

      // Auto-clear warning after cooldown if user comes back
      warningTimerRef.current = setTimeout(() => {
        // If still warning (not escalated to failure), clear it
        if (stateRef.current === 'warning') clearWarning();
      }, WARNING_COOLDOWN);
    };

    const handleFocus = () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      clearWarning();
    };

    const handleMouseLeave = (e: MouseEvent) => {
      // Only trigger if mouse actually leaves the viewport
      if (e.clientY <= 0 || e.clientX <= 0 ||
          e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        if (stateRef.current === 'active') {
          triggerWarning('Mouse left the window — stay focused!');
        }
      }
    };

    const handleMouseEnter = () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      clearWarning();
    };

    window.addEventListener('blur',        handleBlur);
    window.addEventListener('focus',       handleFocus);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      window.removeEventListener('blur',        handleBlur);
      window.removeEventListener('focus',       handleFocus);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [triggerWarning, clearWarning]);

  // ── PROGRESS (0→1) ────────────────────────────────────────
  const progress = 1 - remaining / durationSecs;
  const circumference = 2 * Math.PI * 54; // r=54 on 128px svg

  // ── COLOUR by state ───────────────────────────────────────
  const stateColor: Record<TimerState, string> = {
    idle:    'var(--accent)',
    active:  '#4af7ff',
    warning: '#ffd700',
    failed:  '#ff3355',
    success: '#69ff96',
  };
  const color = stateColor[state];
  const glow  = isClassic ? color : 'transparent';

  return (
    <div className="focus-timer-root flex flex-col items-center gap-6">

      {/* ── IDLE: start prompt ─────────────────────────────── */}
      <AnimatePresence mode="wait">
        {state === 'idle' && (
          <motion.div
            key="idle"
            className="flex flex-col items-center gap-5 text-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <div className="text-4xl">⚔</div>
            <div>
              <p className="font-black text-lg display-font" style={{ color: 'var(--accent)' }}>
                {questTitle}
              </p>
              <p className="text-sm opacity-50 mt-1" style={{ color: 'var(--text-secondary)' }}>
                {formatTime(durationSecs)} focus session · Do not leave this tab
              </p>
            </div>
            <div
              className="rounded-xl px-4 py-3 text-xs space-y-1 text-left border"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
            >
              {[
                '⚡ Stay on this tab the entire time',
                '👁 Don\'t minimise the window',
                '🖱 Keep your mouse inside the window',
                '✅ Complete the task, then submit proof',
              ].map((rule, i) => (
                <p key={i} className="opacity-60" style={{ color: 'var(--text-secondary)' }}>{rule}</p>
              ))}
            </div>
            <motion.button
              onClick={startSession}
              className="px-8 py-3 rounded-xl font-black text-sm uppercase tracking-widest display-font transition-all"
              style={{
                background: 'var(--accent)',
                color: '#000',
                boxShadow: isClassic ? `0 0 20px ${color}66` : 'none',
              }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              Begin Session
            </motion.button>
          </motion.div>
        )}

        {/* ── ACTIVE / WARNING: countdown ring ───────────────── */}
        {(state === 'active' || state === 'warning') && (
          <motion.div
            key="active"
            className="flex flex-col items-center gap-5"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            {/* Countdown ring */}
            <div className="relative" style={{ width: 128, height: 128 }}>
              <svg width={128} height={128} viewBox="0 0 128 128" style={{ overflow: 'visible' }}>
                {/* Track */}
                <circle cx={64} cy={64} r={54} fill="none"
                  stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
                {/* Progress arc */}
                <motion.circle
                  cx={64} cy={64} r={54}
                  fill="none"
                  stroke={color}
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  animate={{ strokeDashoffset: circumference * (1 - progress) }}
                  transition={{ duration: 0.5, ease: 'linear' }}
                  transform="rotate(-90 64 64)"
                  style={{ filter: isClassic ? `drop-shadow(0 0 6px ${color})` : 'none' }}
                />
              </svg>
              {/* Centre: time remaining */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="font-mono font-black text-2xl"
                  style={{ color, textShadow: isClassic ? `0 0 8px ${glow}` : 'none' }}
                >
                  {formatTime(remaining)}
                </span>
                <motion.span
                  className="text-xs uppercase tracking-widest opacity-60"
                  style={{ color: 'var(--text-secondary)' }}
                  animate={state === 'active' ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                >
                  {state === 'active' ? 'Focusing...' : '⚠ Warning'}
                </motion.span>
              </div>

              {/* Pulse ring — active only */}
              {state === 'active' && (
                <motion.div
                  className="absolute inset-0 rounded-full border"
                  style={{ borderColor: color, opacity: 0.2 }}
                  animate={{ scale: [1, 1.12, 1], opacity: [0.2, 0.05, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </div>

            {/* Warning banner */}
            <AnimatePresence>
              {state === 'warning' && (
                <motion.div
                  key="warn-banner"
                  className="rounded-xl px-5 py-3 text-center border"
                  style={{
                    borderColor: '#ffd700',
                    background: 'rgba(255, 215, 0, 0.08)',
                    boxShadow: isClassic ? '0 0 16px rgba(255,215,0,0.2)' : 'none',
                  }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  <p className="font-bold text-sm" style={{ color: '#ffd700' }}>⚠ {warningMsg}</p>
                  <p className="text-xs mt-1 opacity-60" style={{ color: 'var(--text-secondary)' }}>
                    Return to this tab immediately!
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── FAILED ─────────────────────────────────────────── */}
        {state === 'failed' && (
          <motion.div
            key="failed"
            className="flex flex-col items-center gap-4 text-center"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260 }}
          >
            <motion.div
              className="text-5xl"
              animate={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ duration: 0.5 }}
            >
              💀
            </motion.div>
            <div>
              <p className="font-black text-xl display-font" style={{ color: '#ff3355', textShadow: isClassic ? '0 0 16px #ff335566' : 'none' }}>
                Focus Broken
              </p>
              <p className="text-sm opacity-60 mt-1" style={{ color: 'var(--text-secondary)' }}>
                {warningMsg}
              </p>
            </div>
            <div
              className="rounded-xl px-6 py-3 border"
              style={{ borderColor: '#ff3355', background: 'rgba(255,51,85,0.08)' }}
            >
              <p className="font-mono font-black text-lg" style={{ color: '#ff3355' }}>
                −{AURA_PENALTY} AURA
              </p>
              {penaltyAura !== null && (
                <p className="text-xs opacity-50 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  New Aura: {penaltyAura}
                </p>
              )}
            </div>
            <button
              onClick={() => { updateState('idle'); setRemaining(durationSecs); }}
              className="mt-2 px-6 py-2 rounded-xl text-sm font-bold uppercase tracking-widest border transition-all hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Try Again
            </button>
          </motion.div>
        )}

        {/* ── SUCCESS ────────────────────────────────────────── */}
        {state === 'success' && (
          <motion.div
            key="success"
            className="flex flex-col items-center gap-4 text-center"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240 }}
          >
            <motion.div
              className="text-5xl"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.5 }}
            >
              ✅
            </motion.div>
            <div>
              <p className="font-black text-xl display-font" style={{ color: '#69ff96', textShadow: isClassic ? '0 0 16px #69ff9666' : 'none' }}>
                Session Complete!
              </p>
              <p className="text-sm opacity-60 mt-1" style={{ color: 'var(--text-secondary)' }}>
                Now submit your proof to claim XP
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
