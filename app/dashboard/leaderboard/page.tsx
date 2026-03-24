'use client';
// app/dashboard/leaderboard/page.tsx

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Trophy, Star, Shield, Flame } from 'lucide-react';

interface LeaderboardEntry {
  id: string;
  username: string;
  aura: number;
  xp: number;
  level: number;
  streak_days: number;
}

export default function LeaderboardPage() {
  const { isClassic } = useTheme();
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLeaderboard() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      // The leaderboard view is already sorted by XP DESC in the database
      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .limit(50);
        
      if (data) setLeaders(data as LeaderboardEntry[]);
      setLoading(false);
    }
    fetchLeaderboard();
  }, []);

  if (loading) {
    return (
      <div className="leaderboard-loading">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="spinner" />
        <p className="display-font" style={{ color: 'var(--text-secondary)' }}>Loading rankings...</p>
      </div>
    );
  }

  return (
    <motion.div 
      className="leaderboard-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="header-section">
        <div className="title-wrapper">
          <Trophy size={32} className="trophy-icon" />
          <h1 className="display-font title">Global Rankings</h1>
        </div>
        <p className="subtitle">Top 50 protocol participants ranked by total XP.</p>
      </div>

      {/* Podium (Top 3) */}
      {leaders.length >= 3 && (
        <div className="podium-section">
          {/* Rank 2 */}
          <motion.div 
            className="podium-spot rank-2"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="podium-avatar">🥈</div>
            <div className="podium-name">{leaders[1].username}</div>
            <div className="podium-xp">{leaders[1].xp.toLocaleString()} XP</div>
            <div className="podium-bar" style={{ height: '120px' }}>
              <span className="rank-number display-font">2</span>
            </div>
          </motion.div>

          {/* Rank 1 */}
          <motion.div 
            className="podium-spot rank-1"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="podium-avatar">👑</div>
            <div className="podium-name" style={{ color: '#ffd700' }}>{leaders[0].username}</div>
            <div className="podium-xp" style={{ color: '#ffd700' }}>{leaders[0].xp.toLocaleString()} XP</div>
            <div className="podium-bar" style={{ height: '160px' }}>
              <span className="rank-number display-font" style={{ color: '#fff' }}>1</span>
            </div>
          </motion.div>

          {/* Rank 3 */}
          <motion.div 
            className="podium-spot rank-3"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div className="podium-avatar">🥉</div>
            <div className="podium-name">{leaders[2].username}</div>
            <div className="podium-xp">{leaders[2].xp.toLocaleString()} XP</div>
            <div className="podium-bar" style={{ height: '90px' }}>
              <span className="rank-number display-font">3</span>
            </div>
          </motion.div>
        </div>
      )}

      {/* List (Rank 4+) */}
      <div className="list-section">
        {leaders.slice(3).map((user, idx) => {
          const rank = idx + 4;
          const isMe = user.id === currentUserId;
          
          return (
            <motion.div 
              key={user.id}
              className={`list-item ${isMe ? 'is-me' : ''}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + (idx * 0.05) }}
            >
              <div className="item-rank display-font">{rank}</div>
              <div className="item-info">
                <span className="item-name">{user.username} {isMe && <span className="me-badge">YOU</span>}</span>
                <span className="item-level">Lvl {user.level}</span>
              </div>
              <div className="item-stats">
                <span className="stat" title="Aura"><Shield size={12} style={{ color: '#4af7ff' }} /> {user.aura}</span>
                <span className="stat" title="Streak"><Flame size={12} style={{ color: '#ff7733' }} /> {user.streak_days}</span>
                <span className="stat xp" title="Total XP"><Star size={12} style={{ color: '#ffd700' }} /> {user.xp.toLocaleString()}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* If I am Rank 1-3, I still need to know "it's me" but it's obvious from the name. Let's add a small self-check at bottom if not in top 50 (omitted for brevity, assume top 50 covers most early users) */}

      <style jsx>{`
        .leaderboard-page { max-width: 700px; margin: 0 auto; padding-bottom: 3rem; }
        .leaderboard-loading {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-height: 50vh; gap: 16px;
        }
        .spinner {
          width: 32px; height: 32px; border-radius: 50%;
          border: 3px solid var(--border); border-top-color: var(--accent);
        }

        /* Header */
        .header-section { text-align: center; margin-bottom: 3rem; }
        .title-wrapper {
          display: flex; align-items: center; justify-content: center; gap: 12px;
          margin-bottom: 8px;
        }
        .trophy-icon { color: #ffd700; filter: drop-shadow(0 0 10px rgba(255,215,0,0.5)); }
        .title { font-size: 2rem; margin: 0; color: var(--text-primary); text-shadow: 0 0 20px rgba(255,215,0,0.2); }
        .subtitle { color: var(--text-secondary); margin: 0; font-size: 0.9rem; font-family: var(--font-body); }

        /* Podium */
        .podium-section {
          display: flex; align-items: flex-end; justify-content: center; gap: 10px;
          margin-bottom: 3rem; min-height: 250px; padding: 0 10px;
        }
        .podium-spot {
          display: flex; flex-direction: column; align-items: center; flex: 1; max-width: 140px;
        }
        .podium-avatar { font-size: 2.5rem; margin-bottom: 8px; filter: drop-shadow(0 0 10px rgba(255,255,255,0.2)); }
        .podium-name {
          font-weight: 700; font-size: 0.9rem; color: var(--text-primary);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; text-align: center;
          margin-bottom: 4px;
        }
        .podium-xp {
          font-size: 0.75rem; color: var(--text-secondary); font-family: monospace; font-weight: 600;
          margin-bottom: 12px;
        }
        .podium-bar {
          width: 100%; border-radius: 12px 12px 0 0;
          display: flex; justify-content: center; padding-top: 16px;
          position: relative; overflow: hidden;
        }
        .rank-number { font-size: 2rem; color: rgba(0,0,0,0.3); font-weight: 900; z-index: 2; }
        
        .rank-1 .podium-bar { 
          background: linear-gradient(180deg, #ffd700 0%, #aa8800 100%);
          box-shadow: 0 0 30px rgba(255,215,0,0.3), inset 0 2px 5px rgba(255,255,255,0.5);
        }
        .rank-1 .rank-number { text-shadow: 0 2px 4px rgba(0,0,0,0.3); }

        .rank-2 .podium-bar {
          background: linear-gradient(180deg, #e0e0e0 0%, #888888 100%);
          box-shadow: 0 0 20px rgba(224,224,224,0.1), inset 0 2px 5px rgba(255,255,255,0.5);
        }
        
        .rank-3 .podium-bar {
          background: linear-gradient(180deg, #cd7f32 0%, #8b4513 100%);
          box-shadow: 0 0 20px rgba(205,127,50,0.1), inset 0 2px 5px rgba(255,255,255,0.3);
        }

        /* List */
        .list-section {
          display: flex; flex-direction: column; gap: 8px;
        }
        .list-item {
          display: flex; align-items: center; gap: 16px;
          padding: 12px 20px; border-radius: 12px;
          background: var(--bg-card); border: 1px solid var(--border);
          transition: transform 0.2s, border-color 0.2s;
        }
        .list-item:hover {
          transform: translateX(4px); border-color: var(--border-accent);
        }
        .list-item.is-me {
          border-color: var(--accent); background: rgba(74, 247, 255, 0.03);
          ${isClassic ? 'box-shadow: 0 0 15px rgba(74, 247, 255, 0.1);' : ''}
        }
        .item-rank {
          font-size: 1.2rem; color: var(--text-secondary); font-weight: 700;
          width: 30px; text-align: center; opacity: 0.5;
        }
        .item-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .item-name { 
          font-weight: 700; color: var(--text-primary); font-size: 0.95rem;
          display: flex; align-items: center; gap: 8px;
        }
        .me-badge {
          background: var(--accent); color: #000; font-size: 0.55rem;
          padding: 2px 6px; border-radius: 4px; font-weight: 900; letter-spacing: 0.1em;
        }
        .item-level { font-size: 0.7rem; color: var(--text-secondary); font-family: monospace; }
        
        .item-stats { display: flex; align-items: center; gap: 16px; }
        .stat {
          display: flex; align-items: center; gap: 4px;
          font-size: 0.8rem; font-family: monospace; color: var(--text-secondary);
        }
        .stat.xp { color: var(--text-primary); font-weight: 700; }

        @media (max-width: 600px) {
          .item-stats { flex-direction: column; gap: 4px; align-items: flex-end; }
          .podium-name { font-size: 0.8rem; }
          .podium-xp { font-size: 0.65rem; }
          .list-item { padding: 12px; gap: 10px; }
        }
      `}</style>
    </motion.div>
  );
}
