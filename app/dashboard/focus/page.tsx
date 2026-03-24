'use client';
// app/dashboard/focus/page.tsx — The Jail / Focus Monitor
// Tiered Focus Timer (Step 3a): Quest sessions locked to quest duration;
// generic sessions use the 4-tier selector from lib/focus-tiers.

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useFocusMonitor } from '@/hooks/useFocusMonitor';
import FocusTimer from '@/components/FocusTimer';
import ViolationOverlay from '@/components/ViolationOverlay';
import ProofUpload from '@/components/ProofUpload';
import { FOCUS_TIERS, getTier } from '@/lib/focus-tiers';
import type { FocusTierId } from '@/lib/focus-tiers';
import type { Quest, UserQuest } from '@/types/rpg';
import { ArrowLeft, Zap, Clock, Flame, Sword } from 'lucide-react';

const TIER_ICONS: Record<string, React.ReactNode> = {
  sprint:    <Zap   size={20} />,
  session:   <Clock size={20} />,
  deep:      <Flame size={20} />,
  legendary: <Sword size={20} />,
};

// ── TIER SELECTOR ──────────────────────────────────────────────
function TierSelector({
  selected,
  onSelect,
}: {
  selected: FocusTierId;
  onSelect: (id: FocusTierId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {FOCUS_TIERS.map((tier) => {
        const isActive = tier.id === selected;
        return (
          <motion.button
            key={tier.id}
            className={`flex flex-col justify-center items-center p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden bg-slate-900/40 hover:bg-slate-800 ${isActive ? 'border-[var(--tier-color)] shadow-[0_0_15px_-3px_var(--tier-color)]' : 'border-slate-800 hover:border-slate-600'}`}
            style={isActive ? { '--tier-color': tier.color, backgroundColor: `color-mix(in srgb, ${tier.color} 10%, transparent)` } as React.CSSProperties : {}}
            onClick={() => onSelect(tier.id as FocusTierId)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="mb-2" style={{ color: isActive ? tier.color : '#94a3b8' }}>
              {TIER_ICONS[tier.id]}
            </span>
            <span className="text-sm font-bold text-slate-200 display-font">{tier.label}</span>
            <span className="text-xs text-slate-500 font-mono mt-1">{tier.minutes}m</span>
            <div className="flex gap-2 mt-3">
              <span className="text-[10px] text-[#9b59ff] font-bold font-mono py-0.5 px-2 bg-[#9b59ff]/10 rounded-md">+{tier.xp} XP</span>
              <span className="text-[10px] text-[#4af7ff] font-bold font-mono py-0.5 px-2 bg-[#4af7ff]/10 rounded-md">+{tier.aura} ✦</span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ── MAIN PAGE CONTENT ──────────────────────────────────────────
function FocusJailContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const questId      = searchParams.get('questId');

  const [quest,        setQuest]        = useState<Quest | null>(null);
  const [userQuest,    setUserQuest]    = useState<UserQuest | null>(null);
  const [userId,       setUserId]       = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<'setup' | 'active' | 'completed' | 'failed'>('setup');

  // Tier selection — only used for generic (non-quest) sessions
  const [selectedTierId, setSelectedTierId] = useState<FocusTierId>('sprint');
  const selectedTier = getTier(selectedTierId);

  // Resolved duration: quest-linked → quest, generic → selected tier
  const durationSecs = quest
    ? quest.duration_minutes * 60
    : selectedTier.minutes * 60;

  // ── Load quest context ────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      if (!questId) { setLoading(false); return; }

      const { data: questData } = await supabase
        .from('quests')
        .select('*')
        .eq('id', questId)
        .single();

      if (questData) setQuest(questData as Quest);
      else setError('Quest not found');

      const { data: uqData } = await supabase
        .from('user_quests')
        .select('*')
        .eq('user_id', user.id)
        .eq('quest_id', questId)
        .single();

      if (uqData) setUserQuest(uqData as UserQuest);
      setLoading(false);
    }
    load();
  }, [questId, router]);

  // ── Focus Monitor (triple-layer violation detection) ──────────
  const handleAuraPenalty = useCallback(async () => {
    if (sessionState !== 'active') return;
    setSessionState('failed');
    try {
      await fetch('/api/aura/deduct', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: 5, reason: 'focus_violation' }),
      });
    } catch (err) {
      console.error('Failed to deduct aura', err);
    }
  }, [sessionState]);

  const { isViolated } = useFocusMonitor(handleAuraPenalty);

  if (loading) {
    return (
      <div className="focus-loading">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="spinner" />
        <p className="display-font">Initializing The Jail...</p>
      </div>
    );
  }

  const isGraceActive = isViolated && sessionState === 'active';

  return (
    <div className="jail-container">
      <ViolationOverlay
        active={isGraceActive}
        graceSeconds={process.env.NODE_ENV === 'development' ? 2 : 10}
      />

      <div className="jail-content">
        {/* Back Link */}
        {sessionState === 'setup' && (
          <button onClick={() => router.back()} className="back-btn">
            <ArrowLeft size={16} /> Leave Jail
          </button>
        )}

        {/* Quest Info Header (quest-linked session) */}
        {quest && sessionState === 'setup' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-3 text-center mb-4">
            <span className="jail-label">Target Selected:</span>
            <h2 className="display-font quest-title">{quest.title}</h2>
            <p className="quest-desc">{quest.description}</p>
            <div className="quest-duration-badge">
              <Clock size={12} />
              <span>{quest.duration_minutes} min · {quest.xp_reward} XP · {quest.aura_reward} Aura</span>
            </div>
          </div>
        )}

        {/* ── TIER SELECTOR (generic session only) ─────────────── */}
        {!quest && sessionState === 'setup' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-4 mb-4">
            <div className="setup-header">
              <h2 className="display-font setup-title">⚔ Choose Your Session</h2>
              <p className="setup-subtitle">Select a tier. Rewards are locked to your choice — no exploits.</p>
            </div>
            <TierSelector selected={selectedTierId} onSelect={setSelectedTierId} />
            <div className="selected-summary">
              <span style={{ color: selectedTier.color }} className="summary-label">
                {TIER_ICONS[selectedTierId]}
                <strong>{selectedTier.label}</strong> · {selectedTier.desc}
              </span>
              <div className="summary-rewards">
                <span className="reward-chip xp">+{selectedTier.xp} XP</span>
                <span className="reward-chip aura">+{selectedTier.aura} Aura</span>
              </div>
            </div>
          </div>
        )}

        {/* Timer */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative flex flex-col gap-4">
          <FocusTimer
            userId={userId!}
            questId={questId || `generic-${selectedTierId}`}
            durationSecs={durationSecs}
            questTitle={quest ? quest.title : `${selectedTier.label} Session`}
            onSuccess={() => setSessionState('completed')}
            onFailure={() => setSessionState('failed')}
          />

          {sessionState === 'setup' && (
            <div className="start-overlay" onClick={() => setSessionState('active')} />
          )}
        </div>

        {/* Completion / Failure */}
        <AnimatePresence>
          {sessionState === 'completed' && quest?.requires_proof && userQuest && (
            <motion.div
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-3 text-center border-t-4 border-t-accent mt-4"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.5, type: 'spring' }}
            >
              <h3 className="display-font proof-title">Submit Proof</h3>
              <p className="proof-desc">Upload evidence of your work to receive XP and Aura.</p>
              <ProofUpload
                userId={userId!}
                questId={questId!}
                questTitle={quest.title}
                onSubmitted={() => router.push(`/dashboard/quests/${questId}`)}
              />
            </motion.div>
          )}

          {sessionState === 'completed' && (!quest || !quest.requires_proof) && (
            <motion.div className="success-msg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
              <p>Session logged. +{quest?.xp_reward ?? selectedTier.xp} XP incoming.</p>
              <button onClick={() => router.push('/dashboard')} className="action-btn">Exit Jail</button>
            </motion.div>
          )}

          {sessionState === 'failed' && (
            <motion.div className="failure-msg" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p>Focus broken. Aura penalty recorded.</p>
              <button onClick={() => window.location.reload()} className="action-btn retry">Retry Session</button>
            </motion.div>
          )}
        </AnimatePresence>

        {error && <p className="error-msg">⚠ {error}</p>}
      </div>

      <style jsx>{`
        .jail-container {
          min-height: calc(100vh - 120px);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 2rem; position: relative;
        }
        .focus-loading {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 16px; color: var(--text-secondary);
        }
        .spinner {
          width: 32px; height: 32px; border-radius: 50%;
          border: 3px solid var(--border); border-top-color: var(--accent);
        }
        .jail-content {
          width: 100%; max-width: 520px;
          display: flex; flex-direction: column; gap: 1.5rem;
          position: relative; z-index: 10;
        }
        .back-btn {
          display: inline-flex; align-items: center; gap: 6px;
          align-self: flex-start; border: none; background: transparent;
          color: var(--text-secondary); cursor: pointer;
          font-family: var(--font-body); font-size: 0.85rem;
          transition: color 0.2s;
        }
        .back-btn:hover { color: var(--text-primary); }

        /* Quest context header */
        .jail-label {
          font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.15em;
          color: var(--text-secondary); font-weight: 700;
        }
        .quest-title { font-size: 1.4rem; color: var(--text-primary); margin: 8px 0; }
        .quest-desc {
          font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 10px;
          line-height: 1.4; opacity: 0.8;
        }
        .quest-duration-badge {
          display: flex; align-items: center; justify-content: center; gap: 5px;
          font-size: 0.72rem; color: var(--text-secondary); opacity: 0.7;
          font-family: monospace;
        }

        /* Generic session setup */
        .setup-header { text-align: center; }
        .setup-title { font-size: 1.2rem; color: var(--text-primary); margin: 0 0 6px; }
        .setup-subtitle {
          font-size: 0.78rem; color: var(--text-secondary);
          font-family: var(--font-body); opacity: 0.7; margin: 0;
        }

        /* Tier grid */
        .tier-grid {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
        }
        .tier-card {
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          padding: 12px 10px; border-radius: 12px;
          background: var(--bg-secondary); border: 1px solid var(--border);
          cursor: pointer; transition: all 0.2s; text-align: center;
          font-family: var(--font-body); color: var(--text-secondary);
        }
        .tier-card:hover { border-color: var(--border-accent); }
        .tier-active {
          background: color-mix(in srgb, var(--tier-color, var(--accent)) 8%, var(--bg-secondary));
        }
        .tier-icon { line-height: 1; }
        .tier-label { font-size: 0.8rem; color: var(--text-primary); margin-top: 2px; }
        .tier-minutes { font-size: 0.68rem; opacity: 0.5; font-family: monospace; }
        .tier-rewards {
          display: flex; gap: 6px; margin-top: 4px;
        }
        .tier-xp { font-size: 0.62rem; color: #9b59ff; font-weight: 700; font-family: monospace; }
        .tier-aura { font-size: 0.62rem; color: #4af7ff; font-weight: 700; font-family: monospace; }

        /* Selected tier summary */
        .selected-summary {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; border-radius: 10px;
          background: var(--bg-secondary); border: 1px solid var(--border);
        }
        .summary-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 0.78rem; font-family: var(--font-body);
        }
        .summary-rewards { display: flex; gap: 6px; }
        .reward-chip {
          padding: 3px 8px; border-radius: 6px;
          font-size: 0.68rem; font-weight: 700; font-family: monospace;
        }
        .reward-chip.xp   { background: rgba(155,89,255,0.12); color: #9b59ff; }
        .reward-chip.aura { background: rgba(74,247,255,0.10); color: #4af7ff; }

        .start-overlay {
          position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
          width: 160px; height: 45px; z-index: 100; cursor: pointer;
        }

        /* Proof */
        .proof-title { color: var(--accent); font-size: 1.2rem; margin: 0 0 8px; }
        .proof-desc { color: var(--text-secondary); font-size: 0.82rem; margin: 0 0 16px; }

        /* Status messages */
        .success-msg, .failure-msg {
          text-align: center; font-size: 0.9rem;
          padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border);
        }
        .success-msg p { color: #69ff96; margin: 0 0 12px; font-weight: 600; }
        .failure-msg p { color: #ff3355; margin: 0 0 12px; font-weight: 600; }
        .action-btn {
          padding: 10px 24px; border-radius: 10px; font-weight: 700;
          cursor: pointer; background: var(--bg-secondary);
          color: var(--text-primary); border: 1px solid var(--border);
        }
        .action-btn.retry { background: #ff335522; border-color: #ff3355; color: #ff3355; }
        .error-msg { color: #ff3355; text-align: center; font-size: 0.85rem; }

        @media (max-width: 480px) {
          .tier-grid { grid-template-columns: 1fr 1fr; }
          .selected-summary { flex-direction: column; gap: 8px; text-align: center; }
        }
      `}</style>
    </div>
  );
}

export default function FocusJailPage() {
  return (
    <React.Suspense fallback={
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
        <p className="display-font" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading parameters...</p>
        <style jsx>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <FocusJailContent />
    </React.Suspense>
  );
}
