'use client';
// app/dashboard/quests/[id]/page.tsx — Quest Detail + Start Flow

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { supabase, startQuest } from '@/lib/supabase';
import ProofUpload from '@/components/ProofUpload';
import type { Quest, UserQuest } from '@/types/rpg';
import { DIFFICULTY_COLORS, SKILL_TYPE_LABELS } from '@/types/rpg';
import { ArrowLeft, Clock, Zap, Shield, Camera, Play, CheckCircle, XCircle, Hourglass } from 'lucide-react';

export default function QuestDetailPage() {
  const router = useRouter();
  const params = useParams();
  const questId = params.id as string;
  const { isClassic } = useTheme();

  const [quest, setQuest] = useState<Quest | null>(null);
  const [userQuest, setUserQuest] = useState<UserQuest | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch quest + user quest
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      const { data: questData } = await supabase
        .from('quests')
        .select('*')
        .eq('id', questId)
        .single();

      if (!questData) { setError('Quest not found'); setLoading(false); return; }
      setQuest(questData as Quest);

      const { data: uqData } = await supabase
        .from('user_quests')
        .select('*')
        .eq('user_id', user.id)
        .eq('quest_id', questId)
        .maybeSingle();

      if (uqData) setUserQuest(uqData as UserQuest);
      setLoading(false);
    }
    load();
  }, [questId, router]);

  // Start quest
  const handleStart = useCallback(async () => {
    if (!userId || !questId) return;
    setStarting(true);
    setError(null);

    const uqId = await startQuest(userId, questId);
    if (uqId) {
      setUserQuest({
        id: uqId,
        user_id: userId,
        quest_id: questId,
        status: 'active',
        proof_url: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        aura_penalty: 0,
        jury_verdict: null,
        created_at: new Date().toISOString(),
      });
    } else {
      setError('Failed to start quest. Try again.');
    }
    setStarting(false);
  }, [userId, questId]);

  // Cancel / Abandon Quest
  const handleCancel = useCallback(async () => {
    if (!userQuest) return;
    setStarting(true);
    setError(null);

    const { error: delError } = await supabase
      .from('user_quests')
      .delete()
      .eq('id', userQuest.id);

    if (delError) {
      setError('Failed to cancel quest.');
    } else {
      setUserQuest(null); // Reverts back to startable state
    }
    setStarting(false);
  }, [userQuest]);

  if (loading) {
    return (
      <div className="quest-detail-loading">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="spinner" />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading quest...</p>
      </div>
    );
  }

  if (error && !quest) {
    return (
      <div className="quest-detail-error">
        <p>{error}</p>
        <button onClick={() => router.push('/dashboard/quests')} className="back-link">← Back to Quests</button>
      </div>
    );
  }

  if (!quest) return null;

  const diffColor = DIFFICULTY_COLORS[quest.difficulty];
  const skill = SKILL_TYPE_LABELS[quest.skill_type];
  const status = userQuest?.status;

  return (
    <motion.div className="quest-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Back Button */}
      <button onClick={() => router.push('/dashboard/quests')} className="back-btn">
        <ArrowLeft size={16} /> Back to Quests
      </button>

      {/* Hero Card */}
      <div className="hero-card">
        <div className="hero-top">
          <div className="hero-skill-badge" style={{ background: `${diffColor}20` }}>
            <span style={{ fontSize: '2rem' }}>{skill.emoji}</span>
          </div>
          <div className="hero-info">
            <h1 className="display-font hero-title">{quest.title}</h1>
            <div className="hero-badges">
              <span className="diff-badge" style={{ background: diffColor, color: quest.difficulty === 'hard' ? '#fff' : '#000' }}>
                {quest.difficulty.toUpperCase()}
              </span>
              <span className="skill-badge">{skill.emoji} {skill.label}</span>
              {quest.requires_proof && <span className="proof-badge">📸 Proof Required</span>}
            </div>
          </div>
        </div>

        {quest.description && (
          <p className="hero-desc">{quest.description}</p>
        )}

        {/* Reward Grid */}
        <div className="reward-grid">
          <div className="reward-item">
            <Zap size={16} style={{ color: '#ffd700' }} />
            <div>
              <span className="reward-value">+{quest.xp_reward}</span>
              <span className="reward-label">XP</span>
            </div>
          </div>
          <div className="reward-item">
            <Shield size={16} style={{ color: '#4af7ff' }} />
            <div>
              <span className="reward-value">+{quest.aura_reward}</span>
              <span className="reward-label">Aura</span>
            </div>
          </div>
          <div className="reward-item">
            <Clock size={16} style={{ color: '#69ff96' }} />
            <div>
              <span className="reward-value">{quest.duration_minutes}</span>
              <span className="reward-label">Minutes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status / Action Section */}
      <div className="action-section">
        {!status && (
          <motion.button
            className="start-btn display-font"
            onClick={handleStart}
            disabled={starting}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {starting ? (
              <span className="btn-loading">
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} className="mini-spinner" />
                Starting...
              </span>
            ) : (
              <><Play size={16} /> Start Quest</>
            )}
          </motion.button>
        )}

        {status === 'active' && (
          <div className="status-card active-card">
            <div className="status-header" style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="status-dot active" />
                <span className="status-text display-font">Quest Active</span>
              </div>
              <button 
                onClick={handleCancel}
                disabled={starting}
                className="text-[10px] text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-400/50 px-2 py-1 rounded-md transition-colors uppercase tracking-widest font-bold font-mono bg-transparent cursor-pointer"
              >
                {starting ? '...' : 'Abandon'}
              </button>
            </div>
            <p className="status-desc">
              {quest.requires_proof
                ? 'Complete this quest and upload your proof below.'
                : 'Focus on completing this quest. Your Aura depends on it!'}
            </p>
            {quest.requires_proof && userId && (
              <div className="proof-section">
                <ProofUpload
                  userId={userId}
                  questId={questId}
                  questTitle={quest.title}
                  onSubmitted={(uq) => setUserQuest(uq)}
                />
              </div>
            )}
          </div>
        )}

        {status === 'pending_verification' && (
          <div className="status-card pending-card">
            <div className="status-header">
              <Hourglass size={16} style={{ color: '#ffd700' }} />
              <span className="status-text display-font">Pending Verification</span>
            </div>
            <p className="status-desc">Your proof has been submitted and is awaiting jury review.</p>
          </div>
        )}

        {(status === 'completed' || status === 'completed_critical') && (
          <div className={`status-card completed-card ${status === 'completed_critical' ? 'critical-hit' : ''}`}>
            <div className="status-header">
              {status === 'completed_critical' ? <Zap size={16} style={{ color: '#ffd700' }} /> : <CheckCircle size={16} style={{ color: '#69ff96' }} />}
              <span className="status-text display-font">
                {status === 'completed_critical' ? 'CRITICAL HIT! Quest Completed' : 'Quest Completed!'}
              </span>
            </div>
            <p className="status-desc">
              {status === 'completed_critical' 
                ? `Incredible! A critical hit multiplied your rewards! You earned +${Math.floor(quest.xp_reward * 1.5)} XP and +${quest.aura_reward} Aura.` 
                : `You earned +${quest.xp_reward} XP and +${quest.aura_reward} Aura from this quest.`
              }
            </p>
          </div>
        )}

        {status === 'failed' && (
          <div className="status-card failed-card">
            <div className="status-header">
              <XCircle size={16} style={{ color: '#ff3355' }} />
              <span className="status-text display-font">Quest Failed</span>
            </div>
            <p className="status-desc">Your submission was rejected by the jury. You can try again.</p>
            <button className="retry-btn" onClick={handleStart}>
              <Play size={14} /> Retry Quest
            </button>
          </div>
        )}

        {error && <p className="error-msg">⚠ {error}</p>}
      </div>

      <style jsx>{`
        .quest-detail { max-width: 640px; margin: 0 auto; }
        .quest-detail-loading, .quest-detail-error {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; min-height: 50vh; gap: 12px;
          color: var(--text-secondary);
        }
        .spinner {
          width: 28px; height: 28px; border-radius: 50%;
          border: 3px solid var(--border); border-top-color: var(--accent);
        }
        .back-link {
          color: var(--accent); border: none; background: none;
          cursor: pointer; font-size: 0.82rem;
        }

        /* Back */
        .back-btn {
          display: flex; align-items: center; gap: 6px;
          border: none; background: none; color: var(--text-secondary);
          font-size: 0.78rem; font-weight: 600; cursor: pointer;
          margin-bottom: 1rem; transition: color 0.2s;
          font-family: var(--font-body);
        }
        .back-btn:hover { color: var(--accent); }

        /* Hero */
        .hero-card {
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 16px; padding: 1.5rem; margin-bottom: 1.25rem;
        }
        .hero-top { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
        .hero-skill-badge {
          width: 64px; height: 64px; border-radius: 16px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .hero-info { flex: 1; }
        .hero-title { font-size: 1.2rem; margin: 0 0 8px; color: var(--text-primary); }
        .hero-badges { display: flex; gap: 6px; flex-wrap: wrap; }
        .diff-badge {
          font-size: 0.6rem; padding: 3px 8px; border-radius: 6px;
          font-weight: 800; letter-spacing: 0.06em;
        }
        .skill-badge, .proof-badge {
          font-size: 0.65rem; padding: 3px 8px; border-radius: 6px;
          background: var(--bg-secondary); color: var(--text-secondary);
          font-weight: 600;
        }
        .hero-desc {
          font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5;
          margin: 0 0 16px;
        }

        /* Rewards */
        .reward-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
        }
        .reward-item {
          display: flex; align-items: center; gap: 10px;
          padding: 12px; border-radius: 10px; background: var(--bg-secondary);
        }
        .reward-value {
          font-size: 1rem; font-weight: 900; font-family: monospace;
          color: var(--text-primary); display: block;
        }
        .reward-label {
          font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--text-secondary); opacity: 0.6;
        }

        /* Actions */
        .action-section { margin-top: 0; }
        .start-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 14px; border-radius: 14px; border: none;
          background: var(--accent); color: #000; font-size: 0.88rem;
          font-weight: 900; cursor: pointer; transition: all 0.2s;
          text-transform: uppercase; letter-spacing: 0.08em;
          ${isClassic ? 'box-shadow: 0 0 24px var(--accent-glow)44;' : ''}
        }
        .start-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-loading { display: flex; align-items: center; gap: 8px; }
        .mini-spinner {
          display: inline-block; width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid #000; border-top-color: transparent;
        }

        /* Status Cards */
        .status-card {
          padding: 1.25rem; border-radius: 14px; border: 1px solid;
        }
        .active-card { border-color: #4af7ff33; background: rgba(74,247,255,0.04); }
        .pending-card { border-color: #ffd70033; background: rgba(255,215,0,0.04); }
        .completed-card { border-color: #69ff9633; background: rgba(105,255,150,0.04); }
        .failed-card { border-color: #ff335533; background: rgba(255,51,85,0.04); }
        .status-header {
          display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
        }
        .status-dot {
          width: 10px; height: 10px; border-radius: 50%;
        }
        .status-dot.active { background: #4af7ff; box-shadow: 0 0 8px #4af7ff66; }
        .completed-card.critical-hit {
          border-color: #ffd700;
          background: rgba(255, 215, 0, 0.08);
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.2);
        }
        .completed-card.critical-hit .status-text {
          color: #ffd700;
          text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
        }
        .status-text { font-size: 0.9rem; color: var(--text-primary); }
        .status-desc {
          font-size: 0.78rem; color: var(--text-secondary); margin: 0;
          line-height: 1.4;
        }
        .proof-section { margin-top: 16px; }
        .retry-btn {
          display: flex; align-items: center; gap: 6px;
          margin-top: 12px; padding: 8px 16px; border-radius: 10px;
          border: 1px solid var(--border-accent); background: transparent;
          color: var(--accent); font-size: 0.75rem; font-weight: 700;
          cursor: pointer; transition: all 0.2s;
        }
        .retry-btn:hover { background: var(--accent-soft); }
        .error-msg {
          color: #ff3355; font-size: 0.82rem; text-align: center;
          margin-top: 12px;
        }

        @media (max-width: 480px) {
          .reward-grid { grid-template-columns: 1fr; }
          .hero-top { flex-direction: column; text-align: center; }
        }
      `}</style>
    </motion.div>
  );
}
