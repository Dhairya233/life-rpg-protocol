'use client';
// app/dashboard/page.tsx
// ============================================================
// THE LIFE-RPG PROTOCOL — /dashboard  (Sprint 2 — Live Data)
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter }                         from 'next/navigation';
import { motion, AnimatePresence }           from 'framer-motion';
import AuraRing       from '@/components/AuraRing';
import XPBar          from '@/components/XPBar';
import SkillTree      from '@/components/SkillTree';
import ThemeToggle    from '@/components/ThemeToggle';
import { StatsRow }   from '@/components/StatChip';
import FocusTimer     from '@/components/FocusTimer';
import ProofUpload    from '@/components/ProofUpload';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useTheme }   from '@/context/ThemeContext';
import { supabase, fetchMyProfile, signOut, Profile, UserQuest } from '@/lib/supabase';

// ── PANEL TYPES ───────────────────────────────────────────────
type ActivePanel = 'none' | 'focus' | 'proof';

// ── MOCK QUEST (replace with real quest fetch in Sprint 3) ────
const ACTIVE_QUEST = {
  id:           '00000000-0000-0000-0000-000000000001',
  title:        'Iron Protocol',
  durationSecs: 25 * 60,   // 25-minute Pomodoro
};

// ── ANIMATION VARIANTS ────────────────────────────────────────
const containerVariants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

// ── MAIN COMPONENT ────────────────────────────────────────────
function DashboardContent() {
  const { isClassic } = useTheme();
  const router = useRouter();

  const [profile,     setProfile]     = useState<Profile | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [authError,   setAuthError]   = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>('none');
  const [focusDone,   setFocusDone]   = useState(false);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push('/login');
  }, [router]);

  // ── FETCH PROFILE ──────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    const data = await fetchMyProfile();
    if (!data) {
      setAuthError('Could not load profile. Are you signed in?');
    } else {
      setProfile(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // ── REALTIME: live profile updates ────────────────────────
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`profile:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` },
        payload => setProfile(prev => prev ? { ...prev, ...(payload.new as Partial<Profile>) } : prev)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  // ── FOCUS CALLBACKS ────────────────────────────────────────
  const handleFocusSuccess = useCallback(() => {
    setFocusDone(true);
    setActivePanel('proof');
  }, []);

  const handleFocusFailure = useCallback((newAura: number | null) => {
    if (newAura !== null) {
      setProfile(prev => prev ? { ...prev, aura: newAura } : prev);
    }
  }, []);

  const handleProofSubmitted = useCallback((_quest: UserQuest) => {
    setActivePanel('none');
    setFocusDone(false);
    loadProfile();
  }, [loadProfile]);

  // ── LOADING ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="dashboard-bg dashboard-grid-bg min-h-screen flex items-center justify-center">
        <LoadingSpinner message="Loading character data..." size="lg" />
      </div>
    );
  }

  // ── ERROR ──────────────────────────────────────────────────
  if (authError || !profile) {
    return (
      <div className="dashboard-bg min-h-screen flex items-center justify-center px-4">
        <motion.div
          className="character-sheet rounded-3xl p-8 max-w-sm w-full text-center space-y-4"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        >
          <div className="text-4xl">⚠</div>
          <p className="font-black display-font text-lg" style={{ color: '#ff3355' }}>
            Connection Failed
          </p>
          <p className="text-sm opacity-60" style={{ color: 'var(--text-secondary)' }}>
            {authError ?? 'Unknown error.'}
          </p>
          <button
            onClick={loadProfile}
            className="px-6 py-2 rounded-xl text-sm font-bold uppercase tracking-widest border hover:opacity-80 transition-all"
            style={{ borderColor: 'var(--border-accent)', color: 'var(--accent)' }}
          >
            Retry
          </button>
        </motion.div>
      </div>
    );
  }

  const p = profile;

  return (
    <div className="dashboard-bg dashboard-grid-bg min-h-screen">
      {/* Ambient glow — classic only */}
      {isClassic && (
        <>
          <div className="fixed top-0 left-1/3 w-96 h-96 rounded-full blur-3xl opacity-5 pointer-events-none"
            style={{ backgroundColor: '#4af7ff' }} />
          <div className="fixed bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-5 pointer-events-none"
            style={{ backgroundColor: '#b47aff' }} />
        </>
      )}

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* ── TOP NAV ─────────────────────────────────────── */}
        <motion.header
          className="flex items-center justify-between"
          initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div>
            <h1 className="display-font font-black text-xl tracking-wider"
              style={{ color: 'var(--accent)', textShadow: isClassic ? '0 0 12px var(--accent-glow)' : 'none' }}>
              LIFE•RPG
            </h1>
            <p className="text-xs opacity-30 tracking-widest uppercase" style={{ color: 'var(--text-secondary)' }}>
              Protocol v2.0
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={loadProfile}
              className="text-xs px-3 py-1.5 rounded-lg border opacity-40 hover:opacity-70 transition-all"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              title="Refresh">
              ↺
            </button>
            <button
              onClick={handleSignOut}
              className="text-xs px-3 py-1.5 rounded-lg border transition-all hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', opacity: 0.5 }}
              title="Sign out"
            >
              ⏏ Exit
            </button>
            <ThemeToggle />
          </div>
        </motion.header>

        {/* ── CHARACTER SHEET ───────────────────────────────── */}
        <motion.div
          className="character-sheet rounded-3xl p-6 md:p-8"
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <motion.div
            className="flex flex-col md:flex-row items-center md:items-start gap-8"
            variants={containerVariants} initial="hidden" animate="show"
          >
            {/* Aura Ring */}
            <motion.div variants={itemVariants} className="flex-shrink-0 flex flex-col items-center gap-4">
              <AuraRing aura={p.aura} username={p.username}
                avatarUrl={p.avatar_url ?? undefined} size={196} />
              <div className="text-center">
                <div className="display-font font-black text-lg tracking-widest"
                  style={{ color: 'var(--text-primary)' }}>
                  {p.display_name ?? p.username}
                </div>
                <div className="text-xs tracking-[0.2em] uppercase opacity-40"
                  style={{ color: 'var(--text-secondary)' }}>
                  @{p.username}
                </div>
                {p.bio && (
                  <p className="text-xs mt-2 max-w-[160px] opacity-50 text-center leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}>{p.bio}</p>
                )}
              </div>
            </motion.div>

            {/* Stats */}
            <motion.div variants={itemVariants} className="flex-1 w-full space-y-6">
              <div className="text-xs uppercase tracking-[0.25em] opacity-40 section-label font-semibold">
                Character Sheet
              </div>
              <XPBar xp={p.xp} />
              <hr className="rpg-divider" />
              <StatsRow luck={p.luck} streak={p.current_streak} questsCompleted={0} />
            </motion.div>
          </motion.div>
        </motion.div>

        {/* ── SKILL TREE ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <SkillTree
            siliconXp={p.silicon_xp}
            vitalityXp={p.vitality_xp}
            influenceXp={p.influence_xp}
          />
        </motion.div>

        {/* ── QUEST ACTION BAR ────────────────────────────── */}
        <motion.div
          className="character-sheet rounded-2xl p-5"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-black text-sm uppercase tracking-widest display-font"
                style={{ color: 'var(--accent)' }}>Active Quest</h2>
              <p className="text-xs opacity-50 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {ACTIVE_QUEST.title}
              </p>
            </div>
            <div className="flex gap-2">
              {/* Focus button */}
              <button
                onClick={() => setActivePanel(activePanel === 'focus' ? 'none' : 'focus')}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all hover:opacity-80"
                style={{
                  borderColor: activePanel === 'focus' ? 'var(--accent)' : 'var(--border)',
                  color:       activePanel === 'focus' ? 'var(--accent)' : 'var(--text-secondary)',
                  background:  activePanel === 'focus' ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                ⏱ Focus
              </button>
              {/* Proof button — locked until focus done */}
              <button
                onClick={() => setActivePanel(activePanel === 'proof' ? 'none' : 'proof')}
                disabled={!focusDone}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all disabled:opacity-30 hover:opacity-80 disabled:cursor-not-allowed"
                style={{
                  borderColor: activePanel === 'proof' ? '#69ff96' : 'var(--border)',
                  color:       activePanel === 'proof' ? '#69ff96' : 'var(--text-secondary)',
                  background:  activePanel === 'proof' ? 'rgba(105,255,150,0.08)' : 'transparent',
                }}
                title={!focusDone ? 'Complete a focus session first' : 'Submit proof'}
              >
                📸 Proof
              </button>
            </div>
          </div>

          {/* Expandable panels */}
          <AnimatePresence mode="wait">
            {activePanel === 'focus' && (
              <motion.div key="focus-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <FocusTimer
                    userId={p.id}
                    questId={ACTIVE_QUEST.id}
                    durationSecs={ACTIVE_QUEST.durationSecs}
                    questTitle={ACTIVE_QUEST.title}
                    onSuccess={handleFocusSuccess}
                    onFailure={handleFocusFailure}
                  />
                </div>
              </motion.div>
            )}

            {activePanel === 'proof' && (
              <motion.div key="proof-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <ProofUpload
                    userId={p.id}
                    questId={ACTIVE_QUEST.id}
                    questTitle={ACTIVE_QUEST.title}
                    onSubmitted={handleProofSubmitted}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── FOOTER ────────────────────────────────────────── */}
        <motion.footer
          className="text-center text-xs opacity-20 pb-4"
          style={{ color: 'var(--text-secondary)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 0.2 }}
          transition={{ delay: 1 }}
        >
          THE LIFE-RPG PROTOCOL · SPRINT 2 · LIVE DATA ENGINE
        </motion.footer>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
