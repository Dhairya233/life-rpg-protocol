'use client';
// app/dashboard/journal/page.tsx — The Save Point (Daily Diary)
// First entry of the day awards +25 XP via submit_daily_log() RPC.

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { BookOpen, Send, Sparkles, Lock } from 'lucide-react';

interface LogEntry {
  id: string;
  entry: string;
  xp_awarded: number;
  created_at: string;
}

export default function JournalPage() {
  const { isClassic } = useTheme();

  const [entries, setEntries]       = useState<LogEntry[]>([]);
  const [draft, setDraft]           = useState('');
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ xp_awarded: number; first_entry: boolean } | null>(null);
  const [userId, setUserId]         = useState<string | null>(null);

  const loadEntries = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('daily_logs')
      .select('id, entry, xp_awarded, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(30);
    setEntries((data ?? []) as LogEntry[]);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      await loadEntries(user.id);
      setLoading(false);
    }
    init();
  }, [loadEntries]);

  // Deriving today's entry count from loaded entries (UTC date match)
  const todayStr    = new Date().toISOString().slice(0, 10);
  const todayCount  = entries.filter(e => e.created_at.slice(0, 10) === todayStr).length;
  const hasToday    = todayCount > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !userId) return;
    setSubmitting(true);
    setLastResult(null);

    const { data, error } = await supabase.rpc('submit_daily_log', {
      p_user_id: userId,
      p_entry:   draft.trim(),
    });

    if (!error && data) {
      setLastResult(data as { xp_awarded: number; first_entry: boolean });
      setDraft('');
      await loadEntries(userId);
    }
    setSubmitting(false);
  };

  const charCount = draft.length;
  const charMax   = 2000;

  if (loading) {
    return (
      <div className="journal-loading">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="spinner" />
        <p className="display-font">Loading Save Points...</p>
      </div>
    );
  }

  return (
    <motion.div className="journal-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      {/* Header */}
      <div className="journal-header">
        <div className="journal-icon-wrap">
          <BookOpen size={24} />
        </div>
        <div>
          <h1 className="display-font journal-title">📖 Save Point</h1>
          <p className="journal-subtitle">Write your daily log. First entry earns <strong>+25 XP</strong>.</p>
        </div>
      </div>

      {/* XP Result Toast */}
      <AnimatePresence>
        {lastResult && (
          <motion.div
            className={`result-toast ${lastResult.first_entry ? 'toast-xp' : 'toast-logged'}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onAnimationComplete={() => setTimeout(() => setLastResult(null), 3000)}
          >
            {lastResult.first_entry ? (
              <><Sparkles size={14} /> +{lastResult.xp_awarded} XP awarded — first entry of the day!</>
            ) : (
              <><Lock size={14} /> Entry saved. XP already claimed today.</>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entry Form */}
      <div className="card-glass">
        <div className="card-label">
          <span className="dot" style={{ background: hasToday ? '#69ff96' : 'var(--accent)' }} />
          {hasToday ? `${todayCount} entr${todayCount > 1 ? 'ies' : 'y'} today` : 'No entry yet today — +25 XP available'}
        </div>
        <form onSubmit={handleSubmit} className="entry-form">
          <textarea
            className="entry-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="What did you accomplish today? What is worth saving?"
            maxLength={charMax}
            rows={5}
          />
          <div className="entry-footer">
            <span className="char-count" style={{ color: charCount > charMax * 0.9 ? '#ff6b6b' : 'var(--text-secondary)' }}>
              {charCount} / {charMax}
            </span>
            <motion.button
              type="submit"
              className="submit-btn"
              disabled={submitting || !draft.trim()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              {submitting ? 'Saving...' : <><Send size={13} /> Save Point</>}
            </motion.button>
          </div>
        </form>
      </div>

      {/* Previous Entries */}
      <div className="entries-section">
        <span className="entries-label">PREVIOUS ENTRIES</span>
        {entries.length === 0 ? (
          <p className="entries-empty">No entries yet. Write your first Save Point above.</p>
        ) : (
          <div className="entries-list">
            {entries.map((entry) => {
              const dateStr = new Date(entry.created_at).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
              });
              const timeStr = new Date(entry.created_at).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit',
              });
              return (
                <motion.div key={entry.id} className="entry-card" layout>
                  <div className="entry-meta">
                    <span className="entry-date">{dateStr} · {timeStr}</span>
                    {entry.xp_awarded > 0 && (
                      <span className="entry-xp-badge">+{entry.xp_awarded} XP</span>
                    )}
                  </div>
                  <p className="entry-text">{entry.entry}</p>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .journal-page { max-width: 680px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.25rem; }
        .journal-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; gap: 12px; color: var(--text-secondary); }
        .spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--accent); }

        /* Header */
        .journal-header { display: flex; align-items: center; gap: 14px; }
        .journal-icon-wrap { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 14px; background: var(--accent-soft); color: var(--accent); flex-shrink: 0; ${isClassic ? 'box-shadow: 0 0 16px rgba(74,247,255,0.15);' : ''} }
        .journal-title { font-size: 1.3rem; margin: 0; color: var(--text-primary); }
        .journal-subtitle { font-size: 0.8rem; color: var(--text-secondary); margin: 4px 0 0; font-family: var(--font-body); }

        /* Toast */
        .result-toast { padding: 10px 14px; border-radius: 10px; font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 6px; font-family: var(--font-body); }
        .toast-xp { background: rgba(105,255,150,0.1); border: 1px solid rgba(105,255,150,0.3); color: #69ff96; }
        .toast-logged { background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--text-secondary); }

        /* Card */
        .card-glass { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 1.25rem; }
        .card-label { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; color: var(--text-secondary); opacity: 0.6; margin-bottom: 12px; font-family: var(--font-body); }
        .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

        /* Entry form */
        .entry-form { display: flex; flex-direction: column; gap: 10px; }
        .entry-input { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.88rem; font-family: var(--font-body); resize: vertical; outline: none; line-height: 1.55; transition: border-color 0.2s; }
        .entry-input:focus { border-color: var(--border-accent); }
        .entry-input::placeholder { color: var(--text-secondary); opacity: 0.4; }
        .entry-footer { display: flex; align-items: center; justify-content: space-between; }
        .char-count { font-size: 0.68rem; font-family: monospace; transition: color 0.2s; }
        .submit-btn { display: flex; align-items: center; gap: 6px; padding: 9px 18px; border-radius: 10px; background: var(--accent); color: #000; border: none; font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: var(--font-body); transition: opacity 0.2s; }
        .submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Entries list */
        .entries-section { display: flex; flex-direction: column; gap: 10px; }
        .entries-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; color: var(--text-secondary); opacity: 0.4; font-family: var(--font-body); }
        .entries-empty { color: var(--text-secondary); font-size: 0.82rem; opacity: 0.6; font-family: var(--font-body); margin: 0; text-align: center; padding: 1rem; }
        .entries-list { display: flex; flex-direction: column; gap: 8px; }
        .entry-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
        .entry-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .entry-date { font-size: 0.68rem; color: var(--text-secondary); opacity: 0.5; font-family: monospace; }
        .entry-xp-badge { padding: 2px 7px; border-radius: 6px; background: rgba(155,89,255,0.12); color: #9b59ff; font-size: 0.62rem; font-weight: 700; font-family: monospace; }
        .entry-text { font-size: 0.84rem; color: var(--text-primary); line-height: 1.55; margin: 0; white-space: pre-wrap; word-break: break-word; }
      `}</style>
    </motion.div>
  );
}
