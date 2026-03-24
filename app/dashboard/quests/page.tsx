'use client';
// app/dashboard/quests/page.tsx — Quest Board (Global + Private)

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { useQuests } from '@/hooks/useQuests';
import { supabase } from '@/lib/supabase';
import QuestCard from '@/components/QuestCard';
import type { SkillType, QuestDifficulty } from '@/types/rpg';
import { SKILL_TYPE_LABELS, DIFFICULTY_COLORS } from '@/types/rpg';
import { Search, SlidersHorizontal, Globe, Lock, Plus, X, Check } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────
interface PrivateQuest {
  id: string;
  title: string;
  description: string | null;
  skill_type: SkillType;
  xp_reward: number;
  aura_reward: number;
  duration_minutes: number;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
}

type BoardMode = 'global' | 'private';

const ALL_SKILLS: (SkillType | 'all')[] = ['all', 'focus', 'coding', 'fitness', 'creative'];
const ALL_DIFFS: (QuestDifficulty | 'all')[] = ['all', 'easy', 'medium', 'hard', 'legendary'];

// ── Private Quest Form ─────────────────────────────────────────
function CreatePrivateQuestForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle]       = useState('');
  const [desc, setDesc]         = useState('');
  const [skill, setSkill]       = useState<SkillType>('focus');
  const [xp, setXp]             = useState(50);
  const [minutes, setMinutes]   = useState(25);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not authenticated.'); setSaving(false); return; }

    const { error: insertError } = await supabase
      .from('private_quests')
      .insert({
        user_id: user.id,
        title:   title.trim(),
        description: desc.trim() || null,
        skill_type: skill,
        xp_reward: Math.min(200, Math.max(10, xp)),
        duration_minutes: Math.max(5, minutes),
        status: 'active',
      });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    onCreated();
  };

  return (
    <motion.form
      className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-4 mb-4"
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex flex-row justify-between items-center w-full mb-2">
        <h3 className="text-slate-200 font-bold text-lg m-0 leading-tight">New Private Quest</h3>
        <button type="button" onClick={onCancel} className="form-close"><X size={16} /></button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="flex flex-col w-full">
        <div className="flex flex-col gap-1.5 mb-4">
          <label className="text-xs uppercase tracking-widest font-bold text-slate-400">TITLE *</label>
          <input className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 w-full outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-500" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="What will you accomplish?" maxLength={80} required />
        </div>

        <div className="flex flex-col gap-1.5 mb-4">
          <label className="text-xs uppercase tracking-widest font-bold text-slate-400">DESCRIPTION</label>
          <textarea className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 w-full outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-500 resize-y min-h-[80px]" value={desc}
            onChange={e => setDesc(e.target.value)} placeholder="Optional details..." maxLength={300} rows={2} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-widest font-bold text-slate-400">SKILL TYPE</label>
            <select className="cursor-pointer bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 w-full outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" value={skill} onChange={e => setSkill(e.target.value as SkillType)}>
              {(['focus','coding','fitness','creative'] as SkillType[]).map(s => (
                <option key={s} value={s}>{SKILL_TYPE_LABELS[s].emoji} {SKILL_TYPE_LABELS[s].label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-widest font-bold text-slate-400">XP REWARD <span className="font-normal opacity-50">(10–200)</span></label>
            <input type="number" className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 w-full outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" value={xp}
              onChange={e => setXp(Number(e.target.value))} min={10} max={200} step={10} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-widest font-bold text-slate-400">DURATION (min)</label>
            <input type="number" className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 w-full outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" value={minutes}
              onChange={e => setMinutes(Number(e.target.value))} min={5} max={300} step={5} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-slate-400 opacity-80 mt-2 mb-2">
        <Lock size={11} /> Private quests are honor system — no Jury review. XP capped at 200.
      </div>

      <button type="submit" className="flex items-center justify-center gap-2 w-full mt-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" disabled={saving}>
        {saving ? 'Creating...' : <><Check size={16} /> Create Quest</>}
      </button>
    </motion.form>
  );
}

// ── Private Quest Card ─────────────────────────────────────────
function PrivateQuestCard({ quest, onComplete }: { quest: PrivateQuest; onComplete: (id: string) => void }) {
  const { isClassic } = useTheme();
  const skillLabel = SKILL_TYPE_LABELS[quest.skill_type];

  return (
    <motion.div
      className={`bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden transition-all hover:-translate-y-1 hover:border-slate-700 ${quest.status === 'completed' ? 'opacity-50' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      layout
    >
      <div className="flex flex-col gap-2 w-full flex-1 min-w-0">
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{skillLabel.emoji} {skillLabel.label}</span>
        <h3 className="text-slate-200 font-bold text-lg m-0 truncate leading-tight">{quest.title}</h3>
        {quest.description && <p className="text-slate-400 text-sm m-0 line-clamp-1 leading-relaxed opacity-80">{quest.description}</p>}
        <div className="flex flex-row items-center gap-3 flex-wrap mt-1">
          <span className="flex items-center gap-1 text-xs font-mono text-slate-400 font-bold text-[#9b59ff]">+{quest.xp_reward} XP</span>
          <span className="flex items-center gap-1 text-xs font-mono text-slate-400">{quest.duration_minutes}m</span>
          {quest.aura_reward > 0 && <span className="flex items-center gap-1 text-xs font-mono font-bold text-[#4af7ff]">+{quest.aura_reward} ✦</span>}
        </div>
      </div>
      <div className="flex-shrink-0 mt-3 md:mt-0">
        {quest.status === 'active' ? (
          <button className="pq-complete-btn" onClick={() => onComplete(quest.id)}>
            <Check size={14} /> Done
          </button>
        ) : (
          <span className="pq-done-badge">✓</span>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function QuestsPage() {
  const router = useRouter();
  const { isClassic } = useTheme();
  const { quests, myQuests, loading } = useQuests();

  const [mode, setMode]           = useState<BoardMode>('global');
  const [skillFilter, setSkillFilter] = useState<SkillType | 'all'>('all');
  const [diffFilter, setDiffFilter]   = useState<QuestDifficulty | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy]           = useState<'difficulty' | 'xp' | 'duration'>('difficulty');

  // Private quest state
  const [privateQuests, setPrivateQuests] = useState<PrivateQuest[]>([]);
  const [pqLoading, setPqLoading]       = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Build map: quest_id → UserQuest
  const userQuestMap = useMemo(() => {
    const map: Record<string, typeof myQuests[0]> = {};
    myQuests.forEach(uq => { map[uq.quest_id] = uq; });
    return map;
  }, [myQuests]);

  // Filter + sort global quests
  const filteredQuests = useMemo(() => {
    let result = [...quests];
    if (skillFilter !== 'all') result = result.filter(q => q.skill_type === skillFilter);
    if (diffFilter !== 'all') result = result.filter(q => q.difficulty === diffFilter);
    if (searchQuery.trim()) {
      const s = searchQuery.toLowerCase();
      result = result.filter(q =>
        q.title.toLowerCase().includes(s) ||
        (q.description?.toLowerCase().includes(s) ?? false)
      );
    }
    const diffOrder: Record<QuestDifficulty, number> = { easy: 0, medium: 1, hard: 2, legendary: 3 };
    if (sortBy === 'difficulty') result.sort((a, b) => diffOrder[a.difficulty] - diffOrder[b.difficulty]);
    else if (sortBy === 'xp') result.sort((a, b) => b.xp_reward - a.xp_reward);
    else result.sort((a, b) => a.duration_minutes - b.duration_minutes);
    return result;
  }, [quests, skillFilter, diffFilter, searchQuery, sortBy]);

  // Load private quests
  const loadPrivateQuests = useCallback(async () => {
    setPqLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPqLoading(false); return; }

    const { data } = await supabase
      .from('private_quests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setPrivateQuests((data ?? []) as PrivateQuest[]);
    setPqLoading(false);
  }, []);

  useEffect(() => {
    if (mode === 'private') loadPrivateQuests();
  }, [mode, loadPrivateQuests]);

  // Complete a private quest (honor system)
  const handleCompletePrivate = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const quest = privateQuests.find(q => q.id === id);
    if (!quest) return;

    // We now use the safe RPC that caps daily private quest XP at 500
    await supabase.rpc('complete_private_quest', {
      p_quest_id: id,
      p_user_id: user.id
    });

    // Refresh
    setPrivateQuests(prev => prev.map(q => q.id === id ? { ...q, status: 'completed' } : q));
  };

  if (loading) {
    return (
      <div className="quests-loading">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="spinner" />
        <p className="display-font" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading quest board...</p>
      </div>
    );
  }

  return (
    <motion.div className="quests-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      {/* Header */}
      <div className="quests-header">
        <div>
          <h1 className="display-font quests-title">⚔ Quest Board</h1>
          <p className="quests-subtitle">
            {mode === 'global'
              ? `${quests.length} quests available · ${myQuests.filter(q => q.status === 'active').length} active`
              : `${privateQuests.filter(q => q.status === 'active').length} active personal quests`}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === 'global' ? 'mode-active' : ''}`}
            onClick={() => setMode('global')}
          >
            <Globe size={14} /> Global
          </button>
          <button
            className={`mode-btn ${mode === 'private' ? 'mode-active' : ''}`}
            onClick={() => setMode('private')}
          >
            <Lock size={14} /> Private
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* ── GLOBAL MODE ─────────────────────────────────── */}
        {mode === 'global' && (
          <motion.div key="global" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Search Bar */}
            <div className="flex items-center gap-3 px-5 py-3 rounded-full border border-slate-700 bg-slate-900/80 backdrop-blur-md shadow-inner mb-6 transition-colors focus-within:border-slate-500">
              <Search size={18} className="text-slate-500 flex-shrink-0" />
              <input type="text" placeholder="Search quests..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} 
                className="flex-1 border-none outline-none bg-transparent text-slate-200 text-sm placeholder:text-slate-500" />
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 w-16">Skill</span>
                <div className="flex flex-wrap gap-2 items-center">
                  {ALL_SKILLS.map(s => (
                    <button key={s} className={`px-3 py-1.5 rounded-full border transition-colors cursor-pointer text-xs whitespace-nowrap ${skillFilter === s ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-500'}`} onClick={() => setSkillFilter(s)}>
                      {s === 'all' ? '✦ All' : `${SKILL_TYPE_LABELS[s].emoji} ${SKILL_TYPE_LABELS[s].label}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 w-16">Diff</span>
                <div className="flex flex-wrap gap-2 items-center">
                  {ALL_DIFFS.map(d => (
                    <button key={d} className={`px-3 py-1.5 rounded-full border transition-colors cursor-pointer text-xs whitespace-nowrap ${diffFilter === d ? 'border-transparent text-black font-bold' : 'bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-500'}`}
                      onClick={() => setDiffFilter(d)}
                      style={diffFilter === d && d !== 'all' ? { background: DIFFICULTY_COLORS[d], color: d === 'hard' ? '#fff' : '#000' } : diffFilter === d && d === 'all' ? { background: 'var(--accent)', color: '#000'} : {}}>
                      {d === 'all' ? 'All' : d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-slate-500 w-16"><SlidersHorizontal size={11} /> Sort</span>
                <div className="flex flex-wrap gap-2 items-center">
                  {([['difficulty', 'Difficulty'], ['xp', 'XP Reward'], ['duration', 'Duration']] as const).map(([val, label]) => (
                    <button key={val} className={`px-3 py-1.5 rounded-full border transition-colors cursor-pointer text-xs whitespace-nowrap ${sortBy === val ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-500'}`} onClick={() => setSortBy(val)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quest Grid */}
            <div className="quest-grid">
              <AnimatePresence mode="popLayout">
                {filteredQuests.length > 0 ? (
                  filteredQuests.map((quest, idx) => (
                    <QuestCard key={quest.id} quest={quest} userQuest={userQuestMap[quest.id]}
                      index={idx} onClick={() => router.push(`/dashboard/quests/${quest.id}`)} />
                  ))
                ) : (
                  <motion.div className="no-results" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <p>No quests match your filters.</p>
                    <button className="clear-btn" onClick={() => { setSkillFilter('all'); setDiffFilter('all'); setSearchQuery(''); }}>
                      Clear Filters
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ── PRIVATE MODE ────────────────────────────────── */}
        {mode === 'private' && (
          <motion.div key="private" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-row justify-between items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-slate-400" />
                <p className="text-sm text-slate-400 m-0 leading-relaxed">
                  Personal quests are <strong>honor system</strong> — no Jury review. XP is capped at 200. Build good habits.
                </p>
              </div>
              {!showCreateForm && (
                <button className="create-btn" onClick={() => setShowCreateForm(true)}>
                  <Plus size={14} /> New Quest
                </button>
              )}
            </div>

            {/* Create form */}
            <AnimatePresence>
              {showCreateForm && (
                <CreatePrivateQuestForm
                  onCreated={() => { setShowCreateForm(false); loadPrivateQuests(); }}
                  onCancel={() => setShowCreateForm(false)}
                />
              )}
            </AnimatePresence>

            {/* Private quest list */}
            {pqLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading...</div>
            ) : privateQuests.length === 0 && !showCreateForm ? (
              <div className="no-results">
                <p>No private quests yet.</p>
                <button className="clear-btn" onClick={() => setShowCreateForm(true)}>Create your first one →</button>
              </div>
            ) : (
              <div className="pq-list">
                <AnimatePresence mode="popLayout">
                  {privateQuests.map(pq => (
                    <PrivateQuestCard key={pq.id} quest={pq} onComplete={handleCompletePrivate} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .quests-page { max-width: 800px; margin: 0 auto; }
        .quests-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; gap: 12px; }
        .spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--accent); }

        /* Header */
        .quests-header { margin-bottom: 1.25rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
        .quests-title { font-size: 1.3rem; margin: 0; color: var(--text-primary); }
        .quests-subtitle { font-size: 0.78rem; color: var(--text-secondary); margin-top: 4px; font-family: var(--font-body); }

        /* Mode Toggle */
        .mode-toggle { display: flex; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); flex-shrink: 0; }
        .mode-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 7px 14px; font-size: 0.74rem; font-weight: 700;
          cursor: pointer; background: transparent; border: none;
          color: var(--text-secondary); font-family: var(--font-body);
          transition: all 0.15s; letter-spacing: 0.05em;
        }
        .mode-btn:hover { color: var(--text-primary); }
        .mode-active {
          background: var(--accent); color: #000;
          ${isClassic ? 'box-shadow: 0 0 10px rgba(74,247,255,0.25);' : ''}
        }

        /* Filters */
        .filter-section { display: flex; flex-direction: column; gap: 10px; margin-bottom: 1.25rem; }
        .filter-group { display: flex; align-items: center; gap: 8px; }
        .filter-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; color: var(--text-secondary); opacity: 0.5; min-width: 60px; display: flex; align-items: center; gap: 4px; }
        .filter-chips { display: flex; gap: 5px; flex-wrap: wrap; }
        .filter-chip { padding: 4px 10px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: 0.68rem; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: var(--font-body); }
        .filter-chip:hover { border-color: var(--border-accent); }
        .filter-chip.active { background: var(--accent); color: #000; border-color: var(--accent); }

        /* Quest Grid */
        .quest-grid { display: flex; flex-direction: column; gap: 10px; }
        .no-results { text-align: center; padding: 2rem; color: var(--text-secondary); font-size: 0.85rem; }
        .clear-btn { margin-top: 10px; padding: 6px 16px; border-radius: 8px; border: 1px solid var(--border-accent); background: transparent; color: var(--accent); font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        .clear-btn:hover { background: var(--accent-soft); }

        /* Private mode header handled by inline tailwind classes now */
        .create-btn { display: flex; align-items: center; gap: 5px; padding: 8px 14px; border-radius: 10px; background: var(--accent); color: #000; border: none; font-size: 0.78rem; font-weight: 700; cursor: pointer; white-space: nowrap; font-family: var(--font-body); transition: opacity 0.2s; }
        .create-btn:hover { opacity: 0.85; }

        /* Create Form handled mostly by tailwind. Remaining sub-elements: */
        .form-close { background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 6px; }
        .form-close:hover { color: var(--text-primary); }
        .form-error { color: #ff3355; font-size: 0.78rem; margin: 0 0 10px; }
        .form-fields { display: flex; flex-direction: column; gap: 12px; }
        .form-field { display: flex; flex-direction: column; gap: 4px; }
        .form-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; color: var(--text-secondary); opacity: 0.6; font-family: var(--font-body); }
        .form-cap { font-weight: 400; opacity: 0.5; }
        .form-input { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.82rem; font-family: var(--font-body); outline: none; transition: border-color 0.2s; }
        .form-input:focus { border-color: var(--border-accent); }
        .form-textarea { resize: vertical; min-height: 56px; }
        .form-select { cursor: pointer; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .form-note { display: flex; align-items: center; gap: 5px; font-size: 0.68rem; color: var(--text-secondary); opacity: 0.55; margin: 10px 0 14px; font-family: var(--font-body); }
        .form-submit { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 10px; border-radius: 10px; background: var(--accent); color: #000; border: none; font-size: 0.82rem; font-weight: 700; cursor: pointer; font-family: var(--font-body); transition: opacity 0.2s; }
        .form-submit:hover:not(:disabled) { opacity: 0.85; }
        .form-submit:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Private Quest List handled by Tailwind now. */
        .pq-list { display: flex; flex-direction: column; gap: 12px; }
        .pq-complete-btn { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 8px; background: var(--accent-soft); border: 1px solid var(--border-accent); color: var(--accent); font-size: 0.72rem; font-weight: 700; cursor: pointer; transition: all 0.2s; font-family: var(--font-body); }
        .pq-complete-btn:hover { background: var(--accent); color: #000; }
        .pq-done-badge { font-size: 1rem; color: #69ff96; }

        @media (max-width: 640px) {
          .quests-header { flex-direction: column; }
          .filter-group { flex-direction: column; align-items: flex-start; gap: 4px; }
          .filter-label { min-width: auto; }
          .form-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </motion.div>
  );
}
