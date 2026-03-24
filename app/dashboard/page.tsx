'use client';
// app/dashboard/page.tsx — Full Dashboard Overview

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useProfile } from '@/hooks/useProfile';
import { useQuests } from '@/hooks/useQuests';
import { useAuraLog } from '@/hooks/useAuraLog';
import { useDailyLuck } from '@/hooks/useDailyLuck';
import AuraRing from '@/components/AuraRing';
import XPBar from '@/components/XPBar';
import { StatChip, StatsRow } from '@/components/StatChip';
import AvatarShell from '@/components/AvatarShell';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollText, Target, Gavel, User, TrendingUp, Clock, ChevronRight } from 'lucide-react';

// Aura reason → readable label + color
const AURA_REASON_MAP: Record<string, { label: string; icon: string; color: string }> = {
  quest_complete:     { label: 'Quest Completed',     icon: '⚔',  color: '#69ff96' },
  jury_rejection:     { label: 'Jury Rejection',      icon: '⚖',  color: '#ff3355' },
  focus_violation:    { label: 'Focus Violation',      icon: '🔒', color: '#ff6b6b' },
  daily_login:        { label: 'Daily Login',          icon: '📅', color: '#ffd700' },
  streak_bonus:       { label: 'Streak Bonus',         icon: '🔥', color: '#ff8c00' },
};

function getAuraLabel(reason: string) {
  return AURA_REASON_MAP[reason] ?? { label: reason, icon: '✦', color: 'var(--text-secondary)' };
}

export default function DashboardPage() {
  const router = useRouter();
  const { isClassic } = useTheme();
  const { profile, loading: profileLoading } = useProfile();
  const { activeQuest, loading: questsLoading } = useQuests();
  const { entries: auraLog, loading: auraLoading } = useAuraLog(8);
  const { dailyLuck, isGrindDay, hasRolledToday, loading: luckLoading, rollLuck, setHasRolledToday } = useDailyLuck();

  // Loading state
  if (profileLoading) {
    return (
      <div className="dash-loading">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="loading-spinner"
        />
        <p className="loading-text display-font">Loading your character...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="dash-empty">
        <p>Could not load profile. Please try signing in again.</p>
      </div>
    );
  }

  return (
    <motion.div
      className="dashboard-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* ─── Welcome Header ─────────────────────────────── */}
      <div className="dash-header">
        <div>
          <h1 className="display-font dash-title flex items-center gap-3">
            <span>Welcome back, <span className="accent-text">{profile.username}</span></span>
            {profile.role === 'admin' && (
              <span className="text-[10px] font-bold uppercase tracking-widest bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 px-2.5 py-0.5 rounded-md self-center mt-1">
                ADMIN
              </span>
            )}
          </h1>
          <p className="dash-subtitle">Ready to earn some Aura today?</p>
        </div>
        <div className="level-badge display-font">
          <span className="level-num">{profile.level}</span>
          <span className="level-label">LVL</span>
        </div>
      </div>

      {/* ─── Avatar Shell ─────────────────────────────────── */}
      <AvatarShell aura={profile.aura} level={profile.level} />

      {/* ─── Main Stats Grid ────────────────────────────── */}
      <div className="stats-grid">
        {/* Left: Aura Ring */}
        <motion.div
          className="card-glass aura-card"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <AuraRing aura={profile.aura} username={profile.username} size={190} />
        </motion.div>

        {/* Right: XP + Stats */}
        <motion.div
          className="card-glass stats-card"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="section-header">
            <TrendingUp size={14} className="section-icon" />
            <span className="section-label">Character Stats</span>
          </div>
          <XPBar xp={profile.xp} />
          <div className="stat-chips-grid">
            <StatChip icon="⚡" label="Level" value={profile.level} color="var(--accent)" glow="var(--accent-glow)" delay={0.3} />
            <StatChip icon="🔥" label="Streak" value={`${profile.streak_days}d`} color="#ff6b6b" glow="#ff0055" delay={0.4} />
            <StatChip icon="🎲" label="Luck" value={hasRolledToday ? (dailyLuck ?? profile.luck) : '?'} color={hasRolledToday && isGrindDay ? "#ff3355" : "#ffd700"} glow={hasRolledToday && isGrindDay ? "#ff0055" : "#ff8c00"} delay={0.5} />
            <StatChip icon="✦" label="XP" value={profile.xp.toLocaleString()} color="#9b59ff" glow="#6e00ff" delay={0.6} />
          </div>
        </motion.div>
      </div>


      {/* ─── Active Quest + Recent Activity ─────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Active Quest */}
        <motion.div
          className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="section-header">
            <Target size={14} className="section-icon" />
            <span className="section-label">Active Quest</span>
          </div>
          {activeQuest ? (
            <div
              className="active-quest-card bg-slate-800/50 border border-slate-700 shadow-sm rounded-lg p-4 flex flex-row items-center justify-between cursor-pointer hover:bg-slate-800 transition-all"
              onClick={() => router.push(`/dashboard/quests/${activeQuest.quest_id}`)}
            >
              <div className="quest-info flex flex-col gap-2">
                <h3 className="quest-title display-font">{activeQuest.quest.title}</h3>
                <div className="quest-meta">
                  <span className="quest-badge" data-diff={activeQuest.quest.difficulty}>
                    {activeQuest.quest.difficulty.toUpperCase()}
                  </span>
                  <span className="quest-xp">+{activeQuest.quest.xp_reward} XP</span>
                </div>
              </div>
              <ChevronRight size={18} className="quest-arrow" />
            </div>
          ) : (
            <div className="no-quest">
              <p className="no-quest-text">No active quest</p>
              <button
                onClick={() => router.push('/dashboard/quests')}
                className="browse-btn"
              >
                Browse Quests →
              </button>
            </div>
          )}
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="section-header">
            <Clock size={14} className="section-icon" />
            <span className="section-label">Recent Aura Activity</span>
          </div>
          {auraLog.length > 0 ? (
            <div className="activity-list">
              {auraLog.map((entry) => {
                const info = getAuraLabel(entry.reason);
                const isPositive = entry.delta > 0;
                return (
                  <motion.div
                    key={entry.id}
                    className="activity-item"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <span className="activity-icon">{info.icon}</span>
                    <div className="activity-content">
                      <span className="activity-label">{info.label}</span>
                      <span className="activity-time">
                        {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <span
                      className="activity-delta"
                      style={{ color: isPositive ? '#69ff96' : '#ff3355' }}
                    >
                      {isPositive ? '+' : ''}{entry.delta}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <p className="no-activity">No Aura changes yet. Complete a quest to get started!</p>
          )}
        </motion.div>
      </div>

      {/* ─── Quick Actions ─────────────────────────────── */}
      <div className="quick-actions">
        {[
          { href: '/dashboard/quests', icon: <ScrollText size={22} />, title: 'Quest Board', desc: 'Browse & start quests', color: 'var(--accent)' },
          { href: '/dashboard/focus', icon: <Target size={22} />, title: 'Focus Jail', desc: 'Deep work session', color: '#ff6b6b' },
          { href: '/dashboard/jury', icon: <Gavel size={22} />, title: 'The Jury', desc: 'Review peer quests', color: '#ffd700' },
          { href: '/dashboard/profile', icon: <User size={22} />, title: 'Profile', desc: 'Stats & settings', color: '#9b59ff' },
        ].map((action) => (
          <motion.button
            key={action.href}
            className="action-card bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-3 justify-between w-full hover:bg-slate-800/80 transition-all text-left"
            onClick={() => router.push(action.href)}
            whileHover={{ y: -2, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex flex-row items-center gap-3">
              <div className="action-icon" style={{ color: action.color }}>
                {action.icon}
              </div>
              <h3 className="text-slate-200 font-bold text-lg m-0 leading-tight">{action.title}</h3>
            </div>
            <p className="text-slate-400 text-sm m-0 leading-relaxed">{action.desc}</p>
          </motion.button>
        ))}
      </div>

      {/* ─── Inline Styles ──────────────────────────────── */}
      <style jsx>{`
        .dashboard-page { max-width: 960px; margin: 0 auto; }
        .dash-loading {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-height: 50vh; gap: 16px;
        }
        .loading-spinner {
          width: 32px; height: 32px; border-radius: 50%;
          border: 3px solid var(--border); border-top-color: var(--accent);
        }
        .loading-text { color: var(--text-secondary); font-size: 0.85rem; }
        .dash-empty { text-align: center; padding-top: 4rem; color: var(--text-secondary); }

        /* Header */
        .dash-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 1.5rem;
        }
        .dash-title { font-size: 1.3rem; margin: 0; color: var(--text-primary); }
        .accent-text { color: var(--accent); }
        .dash-subtitle {
          color: var(--text-secondary); font-size: 0.82rem; margin-top: 4px;
          font-family: var(--font-body);
        }
        .level-badge {
          display: flex; flex-direction: column; align-items: center;
          padding: 10px 16px; border-radius: 14px;
          background: var(--bg-card); border: 1px solid var(--border);
        }
        .level-num {
          font-size: 1.6rem; font-weight: 900; color: var(--accent);
          line-height: 1;
          ${isClassic ? 'text-shadow: 0 0 10px var(--accent-glow);' : ''}
        }
        .level-label { font-size: 0.6rem; letter-spacing: 0.15em; color: var(--text-secondary); }

        /* Grind Day Banner */
        .grind-day-banner { overflow: hidden; margin-bottom: 1.25rem; }
        .grind-day-inner { 
          background: rgba(236, 72, 153, 0.1); 
          border: 1px solid rgba(236, 72, 153, 0.3); 
          border-radius: 12px; padding: 12px 16px; 
          display: flex; align-items: center; gap: 12px; 
          font-family: var(--font-body); color: var(--text-primary); 
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 0 20px rgba(236, 72, 153, 0.15); 
        }
        .grind-icon { font-size: 1.2rem; }
        .grind-text { font-size: 0.88rem; font-weight: 500; }

        /* Cards */
        .section-header {
          display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
        }
        .section-icon { color: var(--text-secondary); opacity: 0.7; }
        .section-label {
          font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.12em;
          font-weight: 700; color: var(--text-secondary);
        }

        /* Stats Grid */
        .stats-grid {
          display: grid; grid-template-columns: 260px 1fr;
          gap: 1.25rem; margin-bottom: 1.25rem;
        }
        .aura-card {
          display: flex; align-items: center; justify-content: center;
          padding: 1.5rem;
        }
        .stats-card { display: flex; flex-direction: column; gap: 14px; }
        .stat-chips-grid {
          display: grid; grid-template-columns: repeat(2, 1fr);
          gap: 8px; margin-top: 4px;
        }

        /* Mid Grid */
        .mid-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 1.25rem; margin-bottom: 1.25rem;
        }

        /* Active Quest */
        .active-quest-card {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px; border-radius: 12px; cursor: pointer;
          background: var(--accent-soft); border: 1px solid var(--border-accent);
          transition: all 0.2s;
        }
        .active-quest-card:hover { transform: translateX(4px); }
        .quest-info { display: flex; flex-direction: column; gap: 6px; }
        .quest-title { font-size: 0.88rem; color: var(--text-primary); margin: 0; }
        .quest-meta { display: flex; align-items: center; gap: 8px; }
        .quest-badge {
          font-size: 0.6rem; padding: 2px 8px; border-radius: 6px;
          font-weight: 700; letter-spacing: 0.08em;
          background: var(--accent); color: #000;
        }
        .quest-badge[data-diff="easy"] { background: #39ff6b; }
        .quest-badge[data-diff="medium"] { background: #4af7ff; }
        .quest-badge[data-diff="hard"] { background: #9b59ff; color: #fff; }
        .quest-badge[data-diff="legendary"] { background: #ffd700; }
        .quest-xp { font-size: 0.72rem; font-family: monospace; color: var(--text-secondary); }
        .quest-arrow { color: var(--text-secondary); opacity: 0.5; }

        .no-quest { text-align: center; padding: 12px 0; }
        .no-quest-text { color: var(--text-secondary); font-size: 0.82rem; margin: 0 0 10px; }
        .browse-btn {
          padding: 8px 20px; border-radius: 10px; font-size: 0.78rem;
          font-weight: 700; cursor: pointer; transition: all 0.2s;
          background: var(--accent); color: #000; border: none;
        }
        .browse-btn:hover { opacity: 0.85; }

        /* Activity List */
        .activity-list { display: flex; flex-direction: column; gap: 8px; }
        .activity-item {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 10px;
          background: var(--bg-secondary);
        }
        .activity-icon { font-size: 1rem; }
        .activity-content {
          flex: 1; display: flex; flex-direction: column;
        }
        .activity-label { font-size: 0.78rem; font-weight: 600; color: var(--text-primary); }
        .activity-time { font-size: 0.65rem; color: var(--text-secondary); opacity: 0.5; }
        .activity-delta {
          font-family: monospace; font-weight: 700; font-size: 0.82rem;
        }
        .no-activity {
          color: var(--text-secondary); font-size: 0.8rem; text-align: center;
          padding: 16px 0; opacity: 0.6;
        }

        /* Quick Actions Grid layout */
        .quick-actions {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;
        }


        /* Responsive */
        @media (max-width: 768px) {
          .stats-grid { grid-template-columns: 1fr; }
          .mid-grid { grid-template-columns: 1fr; }
          .quick-actions { grid-template-columns: repeat(2, 1fr); }
          .stat-chips-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
          .quick-actions { grid-template-columns: 1fr; }
        }
      `}</style>
    </motion.div>
  );
}
