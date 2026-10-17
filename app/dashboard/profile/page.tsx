'use client';
// app/dashboard/profile/page.tsx — Full Character Sheet

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { useProfile } from '@/hooks/useProfile';
import { useAuraLog } from '@/hooks/useAuraLog';
import AuraRing from '@/components/AuraRing';
import XPBar from '@/components/XPBar';
import { StatsRow } from '@/components/StatChip';
import { auraRank, auraColors, calculateLevel, xpForLevel, xpToNextLevel } from '@/lib/rpg-engine';
import { Shield, Flame, Star, TrendingUp, TrendingDown, Calendar, Settings } from 'lucide-react';

const AURA_REASON_MAP: Record<string, { label: string; icon: string }> = {
  quest_complete:  { label: 'Quest Completed',  icon: '⚔' },
  jury_rejection:  { label: 'Jury Rejection',   icon: '⚖' },
  focus_violation: { label: 'Focus Violation',   icon: '🔒' },
  daily_login:     { label: 'Daily Login',       icon: '📅' },
  streak_bonus:    { label: 'Streak Bonus',      icon: '🔥' },
};

export default function ProfilePage() {
  const { isClassic, toggle: toggleTheme, theme } = useTheme();
  const { profile, loading } = useProfile();
  const { entries: auraLog } = useAuraLog(30);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'settings'>('overview');

  if (loading) {
    return (
      <div className="profile-loading">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="spinner" />
        <p className="display-font" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return <div className="profile-error">Could not load profile.</div>;
  }

  const rank = auraRank(profile.aura);
  const [innerColor] = auraColors(profile.aura);
  const toNext = xpToNextLevel(profile.xp);

  return (
    <motion.div className="profile-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* ─── Hero Section ─────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md flex flex-col sm:flex-row items-center gap-6 mb-6 text-center sm:text-left">
        <AuraRing aura={profile.aura} username={profile.username} size={160} />
        <div className="flex-1">
          <h1 className="text-slate-200 font-bold text-2xl md:text-3xl m-0 leading-tight flex items-center gap-3 justify-center sm:justify-start">
            {profile.username}
            {profile.role === 'admin' && (
              <span className="text-[10px] font-bold uppercase tracking-widest bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 px-2.5 py-0.5 rounded-md mt-1">
                ADMIN
              </span>
            )}
          </h1>
          <p className="font-bold uppercase tracking-widest text-[10px] mt-1 mb-3" style={{ color: innerColor }}>{rank}</p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
            <span className="flex items-center gap-1.5 text-xs text-slate-400 font-mono"><Shield size={14} /> Aura {profile.aura}</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400 font-mono"><Star size={14} /> Level {profile.level}</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400 font-mono"><Flame size={14} /> {profile.streak_days}d Streak</span>
          </div>
        </div>
      </div>

      {/* ─── Tabs ─────────────────────────────────── */}
      <div className="flex gap-6 border-b border-slate-800 mb-6 overflow-x-auto no-scrollbar">
        {(['overview', 'timeline', 'settings'] as const).map(tab => (
          <button
            key={tab}
            className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors whitespace-nowrap border-b-2 ${activeTab === tab ? 'text-slate-200 border-indigo-400' : 'text-slate-500 border-transparent hover:text-slate-400'}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'overview' && '📊 Overview'}
            {tab === 'timeline' && '📜 Timeline'}
            {tab === 'settings' && '⚙ Settings'}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ──────────────────────────── */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overview-tab">
            {/* XP Progress */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-3 mb-4">
              <h3 className="text-slate-200 font-bold text-sm m-0">Experience</h3>
              <XPBar xp={profile.xp} />
              <div className="text-[10px] text-slate-400 font-mono text-center mt-2">
                <span>{toNext.toLocaleString()} XP to Level {profile.level + 1}</span>
              </div>
            </div>

            {/* Stat Chips */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-3 mb-4">
              <h3 className="text-slate-200 font-bold text-sm m-0">Quick Stats</h3>
              <StatsRow luck={profile.luck} streak={profile.streak_days} />
            </div>

            {/* Aura Breakdown */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-3 mb-4">
              <h3 className="text-slate-200 font-bold text-sm m-0">Aura</h3>
              <div className="aura-meter">
                <div className="aura-meter-track">
                  <motion.div
                    className="aura-meter-fill"
                    style={{ backgroundColor: innerColor, boxShadow: isClassic ? `0 0 12px ${innerColor}66` : 'none' }}
                    initial={{ width: '0%' }}
                    animate={{ width: `${(profile.aura / 1000) * 100}%` }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                  />
                </div>
                <div className="aura-meter-labels">
                  <span>0</span>
                  <span style={{ color: innerColor, fontWeight: 700 }}>{profile.aura}</span>
                  <span>1000</span>
                </div>
              </div>
              <div className="aura-rank-badges">
                {['Unranked', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'].map(r => (
                  <span key={r} className={`rank-badge ${rank === r ? 'current' : ''}`}>
                    {r}
                  </span>
                ))}
              </div>
            </div>

            {/* Account Info */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-2 mb-4">
              <h3 className="text-slate-200 font-bold text-sm m-0 mb-2">Account</h3>
              <div className="info-grid">
                <div className="info-row">
                  <span className="info-label">Joined</span>
                  <span className="info-value">{new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Theme</span>
                  <span className="info-value">{theme === 'classic' ? '⚡ Classic RPG' : '☀ Clean Modern'}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'timeline' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="timeline-tab">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-3 mb-4">
              <h3 className="text-slate-200 font-bold text-sm m-0 mb-3">Aura Timeline</h3>
              {auraLog.length > 0 ? (
                <div className="timeline-list">
                  {auraLog.map((entry, idx) => {
                    const info = AURA_REASON_MAP[entry.reason] ?? { label: entry.reason, icon: '✦' };
                    const isPositive = entry.delta > 0;
                    return (
                      <motion.div
                        key={entry.id}
                        className="timeline-item"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                      >
                        <div className="tl-dot" style={{ borderColor: isPositive ? '#69ff96' : '#ff3355' }} />
                        <div className="tl-line" />
                        <div className="tl-content">
                          <div className="tl-header">
                            <span className="tl-icon">{info.icon}</span>
                            <span className="tl-label">{info.label}</span>
                            <span className="tl-delta" style={{ color: isPositive ? '#69ff96' : '#ff3355' }}>
                              {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                              {isPositive ? '+' : ''}{entry.delta}
                            </span>
                          </div>
                          <span className="tl-time">
                            <Calendar size={10} />
                            {new Date(entry.created_at).toLocaleString('en-US', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-text">No Aura changes recorded yet.</p>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="settings-tab">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-4 mb-4">
              <h3 className="text-slate-200 font-bold text-sm m-0 mb-2 flex items-center gap-2">
                <Settings size={16} />
                Appearance
              </h3>
              <div className="setting-row">
                <div>
                  <p className="setting-label">Theme</p>
                  <p className="setting-desc">Switch between Classic RPG and Clean Modern</p>
                </div>
                <button onClick={toggleTheme} className="theme-switch-btn display-font">
                  {isClassic ? '☀ Switch to Modern' : '⚡ Switch to Classic'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* ─── Styles ──────────────────────────────── */}
      <style jsx>{`
        .profile-page { max-width: 720px; margin: 0 auto; }
        .profile-loading, .profile-error {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; min-height: 50vh; gap: 12px;
          color: var(--text-secondary);
        }
        .spinner {
          width: 28px; height: 28px; border-radius: 50%;
          border: 3px solid var(--border); border-top-color: var(--accent);
        }

        /* Media query fallbacks for info rows (kept for info grid usage) */

        /* Aura Meter */
        .aura-meter { margin-bottom: 12px; }
        .aura-meter-track {
          height: 8px; border-radius: 6px; background: var(--bg-secondary);
          overflow: hidden;
        }
        .aura-meter-fill { height: 100%; border-radius: 6px; }
        .aura-meter-labels {
          display: flex; justify-content: space-between;
          font-size: 0.65rem; font-family: monospace;
          color: var(--text-secondary); margin-top: 4px;
        }
        .aura-rank-badges {
          display: flex; flex-wrap: wrap; gap: 6px;
        }
        .rank-badge {
          font-size: 0.6rem; padding: 3px 8px; border-radius: 6px;
          background: var(--bg-secondary); color: var(--text-secondary);
          font-weight: 600; letter-spacing: 0.04em;
        }
        .rank-badge.current {
          background: var(--accent); color: #000; font-weight: 800;
        }

        /* Info Grid */
        .info-grid { display: flex; flex-direction: column; gap: 8px; }
        .info-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 6px 0; border-bottom: 1px solid var(--border);
        }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-size: 0.75rem; color: var(--text-secondary); }
        .info-value { font-size: 0.75rem; color: var(--text-primary); font-weight: 600; }

        /* Timeline */
        .timeline-list { display: flex; flex-direction: column; gap: 0; }
        .timeline-item {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 10px 0; position: relative;
        }
        .tl-dot {
          width: 10px; height: 10px; border-radius: 50%;
          border: 2px solid; background: var(--bg-primary);
          flex-shrink: 0; margin-top: 4px; z-index: 1;
        }
        .tl-line {
          position: absolute; left: 4px; top: 18px; bottom: -10px;
          width: 2px; background: var(--border);
        }
        .timeline-item:last-child .tl-line { display: none; }
        .tl-content { flex: 1; }
        .tl-header {
          display: flex; align-items: center; gap: 6px;
        }
        .tl-icon { font-size: 0.9rem; }
        .tl-label { font-size: 0.78rem; font-weight: 600; color: var(--text-primary); flex: 1; }
        .tl-delta {
          display: flex; align-items: center; gap: 3px;
          font-family: monospace; font-weight: 700; font-size: 0.8rem;
        }
        .tl-time {
          display: flex; align-items: center; gap: 4px;
          font-size: 0.65rem; color: var(--text-secondary); opacity: 0.5;
          margin-top: 2px;
        }
        .empty-text {
          text-align: center; color: var(--text-secondary); font-size: 0.8rem;
          padding: 20px 0; opacity: 0.6;
        }

        /* Settings */
        .setting-row {
          display: flex; justify-content: space-between; align-items: center;
          gap: 16px;
        }
        .setting-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); margin: 0; }
        .setting-desc { font-size: 0.7rem; color: var(--text-secondary); margin: 4px 0 0; }
        .theme-switch-btn {
          padding: 8px 16px; border-radius: 10px; border: 1px solid var(--border-accent);
          background: transparent; color: var(--accent); font-size: 0.72rem;
          font-weight: 700; cursor: pointer; transition: all 0.2s;
          white-space: nowrap;
        }
        .theme-switch-btn:hover { background: var(--accent-soft); }

        @media (max-width: 640px) {
          .setting-row { flex-direction: column; text-align: center; gap: 10px; }
        }
      `}</style>
    </motion.div>
  );
}
