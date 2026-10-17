'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash, Edit2, ShieldAlert, X, Check, Search, Filter, Gavel, ExternalLink, ThumbsUp, ThumbsDown, AlertOctagon, Users, Shield, Ban, Save, Activity, Target, Zap, Clock, BookOpen } from 'lucide-react';
import type { SkillType, QuestDifficulty } from '@/types/rpg';
import { SKILL_TYPE_LABELS, DIFFICULTY_COLORS } from '@/types/rpg';

interface GlobalQuest {
  id: string;
  title: string;
  description: string | null;
  skill_type: SkillType;
  difficulty: QuestDifficulty;
  xp_reward: number;
  duration_minutes: number;
}

const ALL_SKILLS: SkillType[] = ['focus', 'coding', 'fitness', 'creative'];
const ALL_DIFFS: QuestDifficulty[] = ['easy', 'medium', 'hard', 'legendary'];

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<'analytics' | 'forge' | 'court' | 'ledger'>('analytics');

  // ANALYTICS STATE
  const [stats, setStats] = useState({ players: 0, economyXp: 0, quests: 0, pending: 0 });
  const [activityFeed, setActivityFeed] = useState<any[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  const loadAnalytics = async () => {
    setLoadingAnalytics(true);
    
    // 1. Players & Economy (We pull all XPs to sum them up)
    const { data: profiles } = await supabase.from('profiles').select('xp');
    const totalXp = profiles?.reduce((sum, p) => sum + (p.xp || 0), 0) || 0;
    
    // 2. Quests count
    const { count: questCount } = await supabase.from('quests').select('*', { count: 'exact', head: true });
    
    // 3. Pending court count
    const { count: pendingCount } = await supabase.from('user_quests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending_verification');
    
    setStats({
      players: profiles?.length || 0,
      economyXp: totalXp,
      quests: questCount || 0,
      pending: pendingCount || 0
    });

    // 4. Activity Feed (Recent Daily Logs + Profile joins)
    const { data: logs } = await supabase
      .from('daily_logs')
      .select('*, profiles(username, aura)')
      .order('created_at', { ascending: false })
      .limit(15);
      
    if (logs) setActivityFeed(logs);
    setLoadingAnalytics(false);
  };

  useEffect(() => {
    if (activeTab === 'analytics') loadAnalytics();
  }, [activeTab]);

  // FORGE STATE
  const [quests, setQuests] = useState<GlobalQuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<GlobalQuest>>({
    title: '', description: '', skill_type: 'focus', difficulty: 'medium', xp_reward: 50, duration_minutes: 30
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterSkill, setFilterSkill] = useState<SkillType | 'all'>('all');

  const filteredQuests = quests.filter(q => {
    const matchesSearch = q.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (q.description?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesSkill = filterSkill === 'all' || q.skill_type === filterSkill;
    return matchesSearch && matchesSkill;
  });

  const loadQuests = async () => {
    setLoading(true);
    const { data } = await supabase.from('quests').select('*').order('created_at', { ascending: false });
    if (data) setQuests(data as GlobalQuest[]);
    setLoading(false);
  };

  useEffect(() => { 
    if (activeTab === 'forge') loadQuests(); 
  }, [activeTab]);

  // COURT STATE
  const [pendingQuests, setPendingQuests] = useState<any[]>([]);
  const [loadingCourt, setLoadingCourt] = useState(true);

  const loadCourt = async () => {
    setLoadingCourt(true);
    const { data } = await supabase
      .from('user_quests')
      .select(`
        *,
        quest:quests (title, xp_reward, aura_reward, skill_type, difficulty),
        submitter:profiles!user_quests_user_id_fkey (username)
      `)
      .eq('status', 'pending_verification')
      .order('proof_submitted_at', { ascending: true });
    
    if (data) setPendingQuests(data);
    setLoadingCourt(false);
  };

  useEffect(() => {
    if (activeTab === 'court') loadCourt();
  }, [activeTab]);

  // LEDGER STATE
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [editingProfile, setEditingProfile] = useState<any | null>(null);

  const loadLedger = async () => {
    setLoadingLedger(true);
    const { data } = await supabase.from('profiles').select('*').order('level', { ascending: false });
    if (data) setProfiles(data);
    setLoadingLedger(false);
  };

  useEffect(() => {
    if (activeTab === 'ledger') loadLedger();
  }, [activeTab]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (editingProfile) {
      await supabase.from('profiles').update({
        xp: editingProfile.xp,
        aura: editingProfile.aura,
        role: editingProfile.role,
        is_banned: editingProfile.is_banned || false
      }).eq('id', editingProfile.id);
    }
    setSaving(false);
    setEditingProfile(null);
    loadLedger();
  };

  // GOD HAND ACTIONS
  const handleApprove = async (uqId: string, userId: string, xp: number, aura: number) => {
    await supabase.from('user_quests').update({ status: 'completed', jury_verdict: 1, completed_at: new Date().toISOString() }).eq('id', uqId);
    await supabase.rpc('grant_quest_rewards', { p_user_id: userId, p_xp_amount: xp, p_aura_amount: aura });
    loadCourt();
  };

  const handleReject = async (uqId: string, userId: string) => {
    await supabase.from('user_quests').update({ status: 'failed', jury_verdict: 0 }).eq('id', uqId);
    await supabase.rpc('deduct_aura', { p_user_id: userId, p_amount: 10, p_reason: 'admin_rejection' });
    loadCourt();
  };

  const handlePenalize = async (uqId: string, userId: string) => {
    if (confirm("Are you sure you want to apply a strict 50 Aura penalty to this user?")) {
      await supabase.from('user_quests').update({ status: 'failed', jury_verdict: -1 }).eq('id', uqId);
      await supabase.rpc('deduct_aura', { p_user_id: userId, p_amount: 50, p_reason: 'admin_penalty' });
      loadCourt();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (formData.id) {
      await supabase.from('quests').update(formData).eq('id', formData.id);
    } else {
      await supabase.from('quests').insert(formData);
    }
    setSaving(false);
    setShowForm(false);
    setFormData({ title: '', description: '', skill_type: 'focus', difficulty: 'medium', xp_reward: 50, duration_minutes: 30 });
    loadQuests();
  };

  const handleDelete = async (id: string, title: string) => {
    if (confirm(`Are you sure you want to permanently delete "${title}"?`)) {
      await supabase.from('quests').delete().eq('id', id);
      loadQuests();
    }
  };

  const openEdit = (q: GlobalQuest) => {
    setFormData(q);
    setShowForm(true);
  };

  const openCreate = () => {
    setFormData({ title: '', description: '', skill_type: 'focus', difficulty: 'medium', xp_reward: 50, duration_minutes: 30 });
    setShowForm(true);
  };

  return (
    <motion.div className="max-w-4xl mx-auto pb-32 pt-6 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3 display-font m-0 tracking-tight">
            <ShieldAlert className="text-red-500" size={28} /> Game Master Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-2">The absolute control center for the Life-RPG Protocol.</p>
        </div>
        {!showForm && activeTab === 'forge' && (
          <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all shadow-[0_4px_15px_-3px_rgba(220,38,38,0.5)] whitespace-nowrap">
            <Plus size={16} /> New Quest
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-800 mb-6 overflow-x-auto pb-2 scrollbar-none">
        <button 
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors whitespace-nowrap border-b-2 flex items-center gap-2 ${activeTab === 'analytics' ? 'text-amber-400 border-amber-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
        >
          <Activity size={16} /> The Oracle
        </button>
        <button 
          onClick={() => setActiveTab('forge')}
          className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors whitespace-nowrap border-b-2 flex items-center gap-2 ${activeTab === 'forge' ? 'text-red-400 border-red-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
        >
          <ShieldAlert size={16} /> Quest Forge
        </button>
        <button 
          onClick={() => setActiveTab('court')}
          className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors whitespace-nowrap border-b-2 flex items-center gap-2 ${activeTab === 'court' ? 'text-indigo-400 border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
        >
          <Gavel size={16} /> High Court
        </button>
        <button 
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors whitespace-nowrap border-b-2 flex items-center gap-2 ${activeTab === 'ledger' ? 'text-teal-400 border-teal-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
        >
          <Users size={16} /> Grand Ledger
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'analytics' ? (
          <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-8">
            {loadingAnalytics ? (
              <div className="text-center p-12 text-slate-500">Divining the timeline...</div>
            ) : (
              <>
                {/* 1. Metrics Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-2 relative overflow-hidden group hover:border-violet-500/50 transition-colors">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Users size={80} /></div>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 m-0">Registered Users</p>
                    <h3 className="text-3xl font-bold text-slate-100 display-font m-0">{stats.players}</h3>
                  </div>
                  
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-2 relative overflow-hidden group hover:border-cyan-500/50 transition-colors">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Zap size={80} /></div>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 m-0">Economy Size (XP)</p>
                    <h3 className="text-3xl font-bold text-cyan-400 display-font m-0">{stats.economyXp.toLocaleString()}</h3>
                  </div>
                  
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-2 relative overflow-hidden group hover:border-red-500/50 transition-colors">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Target size={80} /></div>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 m-0">Global Quests</p>
                    <h3 className="text-3xl font-bold text-red-400 display-font m-0">{stats.quests}</h3>
                  </div>
                  
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-2 relative overflow-hidden group hover:border-amber-500/50 transition-colors">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Gavel size={80} /></div>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 m-0">Pending Cases</p>
                    <h3 className="text-3xl font-bold text-amber-400 display-font m-0">{stats.pending}</h3>
                  </div>

                </div>

                {/* 2. Live Activity Feed */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg flex flex-col h-[500px]">
                  <div className="border-b border-slate-800 p-5 shrink-0 flex items-center justify-between">
                     <h3 className="text-lg font-bold text-slate-200 display-font m-0 flex items-center gap-2">
                       <Activity className="text-amber-400" size={18} /> Global Audit Log
                     </h3>
                     <span className="text-xs uppercase tracking-widest text-slate-500 font-bold bg-slate-950 px-2 py-1 rounded">Last 15 Save Points</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                    {activityFeed.length === 0 ? (
                      <div className="text-center p-8 text-slate-500">No recent activity detected.</div>
                    ) : activityFeed.map(log => (
                      <div key={log.id} className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-4 flex gap-4 hover:border-slate-700 transition-colors">
                        <div className="shrink-0 mt-1">
                          <BookOpen size={16} className="text-emerald-500" />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-sm font-bold text-slate-300">{log.profiles?.username || 'Phantom'} logged an entry</span>
                            <span className="text-[10px] text-slate-500 font-mono tracking-tighter flex items-center gap-1"><Clock size={10} /> {new Date(log.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-slate-400 m-0 mb-2 italic line-clamp-2">"{log.entry}"</p>
                          <div className="flex items-center gap-3">
                             {log.xp_awarded > 0 && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">+{log.xp_awarded} XP Rewarded</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        ) : activeTab === 'forge' ? (
          showForm ? (
          <motion.form 
            key="form"
            onSubmit={handleSave} 
            className="bg-slate-900 border-2 border-slate-800 rounded-xl p-6 shadow-xl mb-8"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-200 display-font m-0 leading-none">
                {formData.id ? 'Edit Global Quest' : 'Create Global Quest'}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white transition-colors bg-slate-800 p-2 rounded-lg"><X size={18} /></button>
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-widest font-bold text-slate-400">Title</label>
                <input required className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" 
                  value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. Master the Blade" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-widest font-bold text-slate-400">Description</label>
                <textarea className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 min-h-[80px] resize-y" 
                  value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Flavor text..." />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-widest font-bold text-slate-400">Skill</label>
                  <select className="cursor-pointer w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" 
                    value={formData.skill_type} onChange={e => setFormData({ ...formData, skill_type: e.target.value as SkillType })}>
                    {ALL_SKILLS.map(s => <option key={s} value={s}>{SKILL_TYPE_LABELS[s].emoji} {SKILL_TYPE_LABELS[s].label}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-widest font-bold text-slate-400">Difficulty</label>
                  <select className="cursor-pointer w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" 
                    value={formData.difficulty} onChange={e => setFormData({ ...formData, difficulty: e.target.value as QuestDifficulty })}>
                    {ALL_DIFFS.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-widest font-bold text-slate-400">XP Reward</label>
                  <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" 
                    value={formData.xp_reward} onChange={e => setFormData({ ...formData, xp_reward: Number(e.target.value) })} min={10} max={1000} step={10} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-widest font-bold text-slate-400">Duration (m)</label>
                  <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" 
                    value={formData.duration_minutes} onChange={e => setFormData({ ...formData, duration_minutes: Number(e.target.value) })} min={5} />
                </div>
              </div>

              <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 w-full mt-4 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all disabled:opacity-50 text-lg">
                {saving ? 'Saving...' : <><Check size={18} /> {formData.id ? 'Update Quest' : 'Publish Quest'}</>}
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="text"
                  placeholder="Search master records..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-3.5 text-slate-200 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-medium placeholder:text-slate-600 shadow-sm hover:shadow-md hover:border-slate-700"
                />
              </div>
              <div className="relative shrink-0 w-full sm:w-56">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <select
                  value={filterSkill}
                  onChange={(e) => setFilterSkill(e.target.value as SkillType | 'all')}
                  className="w-full appearance-none bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-3.5 text-slate-200 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all cursor-pointer font-medium shadow-sm hover:shadow-md hover:border-slate-700"
                >
                  <option value="all">All Skills</option>
                  {ALL_SKILLS.map(s => <option key={s} value={s}>{SKILL_TYPE_LABELS[s].label}</option>)}
                </select>
              </div>
            </div>

            {loading ? (
               <div className="text-center p-12 text-slate-500">Loading master records...</div>
            ) : filteredQuests.length === 0 ? (
               <div className="text-center p-16 text-slate-500 bg-slate-900/50 border border-slate-800 border-dashed rounded-xl flex flex-col items-center gap-4 transition-all">
                  <ShieldAlert size={42} className="text-slate-700 opacity-50" />
                  <div>
                    <h3 className="text-slate-200 font-bold text-lg m-0 display-font">No Records Identified</h3>
                    <p className="m-0 mt-1 text-sm text-slate-400">Modify your search parameters or construct a new global quest.</p>
                  </div>
               </div>
            ) : (
              <div className="flex flex-col gap-4">
                {filteredQuests.map(q => (
                  <div key={q.id} className="bg-slate-900 border border-slate-800 shadow-md rounded-xl p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-5 hover:border-red-500/30 hover:shadow-[0_0_20px_-5px_var(--red-glow)] transition-all cursor-default" style={{ '--red-glow': 'rgba(239, 68, 68, 0.15)' } as React.CSSProperties}>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-[10px] bg-slate-950 border border-slate-800 shadow-inner text-slate-400 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">{SKILL_TYPE_LABELS[q.skill_type].emoji} {q.skill_type}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-widest" style={{ background: `${DIFFICULTY_COLORS[q.difficulty]}15`, border: `1px solid ${DIFFICULTY_COLORS[q.difficulty]}40`, color: DIFFICULTY_COLORS[q.difficulty] }}>{q.difficulty}</span>
                      </div>
                      <h3 className="text-slate-100 font-bold text-xl m-0 tracking-tight">{q.title}</h3>
                      {q.description && <p className="text-slate-400 text-sm m-0 line-clamp-2 leading-relaxed">{q.description}</p>}
                      <div className="flex items-center gap-4 text-xs font-mono font-bold mt-2 bg-slate-950 self-start px-3 py-1.5 rounded-lg border border-slate-800">
                        <span className="text-purple-400">+{q.xp_reward} XP</span>
                        <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                        <span className="text-slate-400">{q.duration_minutes}m</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => openEdit(q)} className="p-3 bg-slate-800/80 hover:bg-indigo-500 hover:text-white border border-slate-700 hover:border-indigo-400 text-slate-300 rounded-xl transition-all shadow-sm"><Edit2 size={18} /></button>
                      <button onClick={() => handleDelete(q.id, q.title)} className="p-3 bg-slate-800/80 hover:bg-red-500 hover:text-white border border-slate-700 hover:border-red-400 text-slate-300 rounded-xl transition-all shadow-sm"><Trash size={18} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )
      ) : activeTab === 'court' ? (
          <motion.div key="court" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {loadingCourt ? (
              <div className="text-center p-12 text-slate-500">Retrieving pending submissions...</div>
            ) : pendingQuests.length === 0 ? (
              <div className="text-center p-16 text-slate-500 bg-slate-900/50 border border-slate-800 border-dashed rounded-xl flex flex-col items-center gap-4 transition-all">
                <Gavel size={42} className="text-slate-700 opacity-50" />
                <div>
                  <h3 className="text-slate-200 font-bold text-lg m-0 display-font">The Realm is Peaceful</h3>
                  <p className="m-0 mt-1 text-sm text-slate-400">There are currently zero pending submissions awaiting God Hand override.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {pendingQuests.map(pq => (
                  <div key={pq.id} className="bg-slate-900 border border-slate-800 shadow-xl rounded-xl p-6 flex flex-col lg:flex-row gap-6 hover:border-indigo-500/30 hover:shadow-[0_0_20px_-5px_rgba(99,102,241,0.15)] transition-all">
                    
                    <div className="flex-1 flex flex-col gap-3">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest flex items-center gap-1">
                           {pq.submitter?.username || 'Unknown User'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{new Date(pq.proof_submitted_at).toLocaleDateString()}</span>
                      </div>
                      
                      <h3 className="text-slate-100 font-bold text-xl m-0 tracking-tight">{pq.quest?.title || 'Unknown Quest'}</h3>
                      
                      <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 italic">
                        "{pq.proof_url}"
                      </div>
                      
                      {pq.proof_url?.startsWith('http') && (
                        <a href={pq.proof_url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 text-xs font-bold w-fit mt-1">
                          <ExternalLink size={12} /> Open Evidence
                        </a>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs font-mono font-bold mt-2">
                        <span className="text-purple-400">+{pq.quest?.xp_reward} XP</span>
                        <span className="text-cyan-400">+{pq.quest?.aura_reward} AURA</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-3 shrink-0 lg:w-48 justify-center">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 text-center mb-1">God Hand Override</p>
                      
                      <button 
                        onClick={() => handleApprove(pq.id, pq.user_id, pq.quest?.xp_reward || 0, pq.quest?.aura_reward || 0)} 
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-green-500/10 hover:bg-green-500 border border-green-500/30 hover:border-green-400 text-green-400 hover:text-white rounded-lg transition-all font-bold text-sm"
                      >
                        <ThumbsUp size={14} /> Approve
                      </button>
                      
                      <button 
                        onClick={() => handleReject(pq.id, pq.user_id)} 
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-orange-500/10 hover:bg-orange-500 border border-orange-500/30 hover:border-orange-400 text-orange-400 hover:text-white rounded-lg transition-all font-bold text-sm"
                      >
                        <ThumbsDown size={14} /> Reject (-10 Aura)
                      </button>
                      
                      <button 
                        onClick={() => handlePenalize(pq.id, pq.user_id)} 
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-red-500/10 hover:bg-red-500 border border-red-500/30 hover:border-red-400 text-red-500 hover:text-white rounded-lg transition-all font-bold text-sm mt-2"
                      >
                        <AlertOctagon size={14} /> SPAM (-50 Aura)
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </motion.div>
      ) : activeTab === 'ledger' ? (
          <motion.div key="ledger" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="text"
                  placeholder="Query players by username..."
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-200 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all font-medium placeholder:text-slate-600 shadow-sm"
                />
              </div>
            </div>

            {loadingLedger ? (
              <div className="text-center p-12 text-slate-500">Querying the Grand Ledger...</div>
            ) : profiles.length === 0 ? (
              <div className="text-center p-16 text-slate-500 bg-slate-900/50 border border-slate-800 border-dashed rounded-xl flex flex-col items-center gap-4">
                <Users size={42} className="text-slate-700 opacity-50" />
                <h3 className="text-slate-200 font-bold text-lg m-0 display-font">The Ledger is Empty</h3>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {profiles
                  .filter(p => p.username?.toLowerCase().includes(ledgerSearch.toLowerCase()) || p.id.includes(ledgerSearch))
                  .map(p => (
                  <div key={p.id} className={`bg-slate-900 border shadow-md rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:shadow-lg transition-all ${p.is_banned ? 'border-red-900/50 opacity-80' : 'border-slate-800 hover:border-teal-500/30'}`}>
                    
                    {editingProfile?.id === p.id ? (
                      <form onSubmit={handleSaveProfile} className="flex-1 p-5 flex flex-col gap-4 w-full">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-slate-200 m-0 display-font text-lg flex items-center gap-2">
                            <Edit2 size={16} className="text-teal-400" /> Editing Player Object
                          </h4>
                          <button type="button" onClick={() => setEditingProfile(null)} className="text-slate-500 hover:text-white p-1 rounded"><X size={18}/></button>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-slate-500">XP</label>
                            <input type="number" value={editingProfile.xp} onChange={e => setEditingProfile({...editingProfile, xp: parseInt(e.target.value) || 0})} className="bg-slate-950 border border-slate-800 rounded text-slate-200 px-3 py-2 text-sm focus:border-teal-500 outline-none" />
                          </div>
                          
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Aura</label>
                            <input type="number" value={editingProfile.aura} onChange={e => setEditingProfile({...editingProfile, aura: parseInt(e.target.value) || 0})} className="bg-slate-950 border border-slate-800 rounded text-slate-200 px-3 py-2 text-sm focus:border-teal-500 outline-none" />
                          </div>
                          
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Role</label>
                            <select value={editingProfile.role || 'user'} onChange={e => setEditingProfile({...editingProfile, role: e.target.value})} className="bg-slate-950 border border-slate-800 rounded text-slate-200 px-3 py-2 text-sm cursor-pointer focus:border-teal-500 outline-none">
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                          
                          <div className="flex flex-col gap-1.5 justify-end">
                             <button type="button" onClick={() => setEditingProfile({...editingProfile, is_banned: !editingProfile.is_banned})} className={`flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-bold transition-colors ${editingProfile.is_banned ? 'bg-red-500/20 text-red-500 border border-red-500/50' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}>
                               <Ban size={14} /> {editingProfile.is_banned ? 'BANNED' : 'Ban User'}
                             </button>
                          </div>
                        </div>
                        
                        <button type="submit" disabled={saving} className="mt-2 w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 text-white py-2.5 rounded-lg font-bold transition-colors text-sm">
                          {saving ? 'Writing...' : <><Save size={16} /> Save Record</>}
                        </button>
                      </form>
                    ) : (
                      <div className="p-5 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700 relative">
                             {p.role === 'admin' ? <Shield size={18} className="text-cyan-400" /> : <Users size={16} className="text-slate-400" />}
                             {p.is_banned && <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border border-slate-900 flex items-center justify-center"><Ban size={10} className="text-white" /></div>}
                          </div>
                          <div className="flex flex-col">
                            <h3 className={`font-bold text-lg m-0 tracking-tight flex items-center gap-2 ${p.is_banned ? 'text-red-400 line-through opacity-80' : 'text-slate-100'}`}>
                              {p.username || 'Anonymous Participant'} 
                              {p.role === 'admin' && <span className="text-[9px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded font-black tracking-widest uppercase">Admin</span>}
                            </h3>
                            <p className="text-xs text-slate-500 font-mono m-0 mt-0.5">ID: {p.id.split('-')[0]}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-5 sm:gap-8 bg-slate-950/50 px-4 py-2.5 rounded-lg border border-slate-800/50 shrink-0">
                           <div className="flex flex-col items-center">
                             <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-0.5">LVL</span>
                             <span className="font-mono font-bold text-slate-200">{p.level}</span>
                           </div>
                           <div className="flex flex-col items-center">
                             <span className="text-[10px] text-purple-400 uppercase font-bold tracking-widest mb-0.5">XP</span>
                             <span className="font-mono font-bold text-slate-200">{p.xp}</span>
                           </div>
                           <div className="flex flex-col items-center">
                             <span className="text-[10px] text-cyan-400 uppercase font-bold tracking-widest mb-0.5">AURA</span>
                             <span className="font-mono font-bold text-slate-200">{p.aura}</span>
                           </div>
                        </div>
                        
                        <button onClick={() => setEditingProfile(p)} className="shrink-0 p-3 bg-slate-800/50 hover:bg-teal-500/20 text-slate-400 hover:text-teal-400 border border-slate-700/50 hover:border-teal-500/50 rounded-xl transition-all h-fit self-end sm:self-center">
                          <Edit2 size={16} />
                        </button>
                      </div>
                    )}

                  </div>
                ))}
              </div>
            )}
          </motion.div>
      ) : null}
      </AnimatePresence>
      <style jsx>{`
        .display-font { font-family: 'Outfit', sans-serif; }
      `}</style>
    </motion.div>
  );
}
