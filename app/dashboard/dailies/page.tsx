'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { useDailyLuck } from '@/hooks/useDailyLuck';
import TestMyLuck from '@/components/TestMyLuck';
import { CheckCircle2, Calendar, BookOpen, Sparkles, Plus } from 'lucide-react';

interface AIQuest {
  title: string;
  description: string;
  skill_type: 'focus'|'coding'|'fitness'|'creative';
  xp_reward: number;
  duration_minutes: number;
}

export default function DailiesPage() {
  const { profile, loading: profileLoading, refetch: refreshProfile } = useProfile();
  const { dailyLuck, isGrindDay, hasRolledToday, loading: luckLoading, rollLuck, setHasRolledToday } = useDailyLuck();
  
  const [claiming, setClaiming] = useState(false);
  const [diaryText, setDiaryText] = useState('');
  const [diarySaved, setDiarySaved] = useState(false);
  const [savingDiary, setSavingDiary] = useState(false);
  const [logId, setLogId] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [aiQuests, setAiQuests] = useState<AIQuest[]>([]);
  const [acceptedQuests, setAcceptedQuests] = useState<Set<number>>(new Set());

  const todayStr = new Date().toISOString().split('T')[0];
  const hasClaimedSignIn = profile?.last_active === todayStr;

  React.useEffect(() => {
    async function loadDiary() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('daily_logs')
        .select('id, entry, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
        
      if (data) {
        // Ensure it belongs to "today" locally
        const logDate = new Date(data.created_at).toISOString().split('T')[0];
        if (logDate === todayStr) {
          setDiaryText(data.entry);
          setLogId(data.id);
          setDiarySaved(true);
        }
      }
    }
    loadDiary();
  }, [todayStr]);

  if (profileLoading || luckLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-4">
        <div className="w-8 h-8 rounded-full border-4 border-slate-800 border-t-cyan-500 animate-spin" />
        <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">Loading Dailies...</p>
      </div>
    );
  }

  if (!profile) return null;

  const handleClaimSignIn = async () => {
    if (hasClaimedSignIn || claiming) return;
    setClaiming(true);
    // Explicitly call the update_streak function to grant rewards
    await supabase.rpc('update_streak', { p_user_id: profile.id });
    await refreshProfile();
    setClaiming(false);
  };

  const handleSaveDiary = async () => {
    if (!diaryText.trim()) return;
    setSavingDiary(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let errorObj;
    if (logId) {
      const { error } = await supabase.from('daily_logs').update({ entry: diaryText.trim() }).eq('id', logId);
      errorObj = error;
    } else {
      const { data, error } = await supabase.from('daily_logs')
        .insert({ user_id: user.id, entry: diaryText.trim() })
        .select('id')
        .single();
      errorObj = error;
      if (data) setLogId(data.id);
    }
    
    if (!errorObj) {
      setDiarySaved(true);
      if (!hasClaimedSignIn && !claiming) {
        await handleClaimSignIn();
      }
    }
    setSavingDiary(false);
  };

  const handleGeneratePlan = async () => {
    if (!diaryText.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({ entry: diaryText.trim() })
      });
      const data = await res.json();
      if (data.quests) setAiQuests(data.quests);
    } catch(e) { console.error('Gen Plan Error:', e); }
    setGenerating(false);
  };

  const acceptAiQuest = async (index: number, quest: AIQuest) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // We create the quest assuming the user intends to do it tomorrow
    await supabase.from('private_quests').insert({
      user_id: user.id,
      title: quest.title,
      description: quest.description,
      skill_type: quest.skill_type,
      xp_reward: quest.xp_reward,
      duration_minutes: quest.duration_minutes,
      status: 'active'
    });

    setAcceptedQuests(prev => {
      const n = new Set(prev);
      n.add(index);
      return n;
    });
  };

  return (
    <motion.div
      className="max-w-2xl mx-auto pb-32 pt-8 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="mb-8 pl-1 text-center sm:text-left">
        <h1 className="text-3xl font-bold text-slate-100 display-font mb-2 tracking-tight">Daily Objectives</h1>
        <p className="text-slate-400 text-sm">Return every 24 hours to maximize your growth and test your fate.</p>
      </div>

      <div className="flex flex-col gap-6">
        
        {/* Daily Sign In Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md flex flex-col sm:flex-row items-center justify-between gap-6 transition-colors hover:border-slate-700">
          <div className="flex items-center gap-5 w-full sm:w-auto">
            <div className={`p-4 rounded-xl ${hasClaimedSignIn ? 'bg-green-500/10 text-green-500 shadow-[0_0_15px_-5px_#22c55e]' : 'bg-cyan-500/10 text-cyan-500 shadow-[0_0_15px_-5px_#06b6d4]'}`}>
              <Calendar size={28} />
            </div>
            <div className="text-left w-full">
              <h2 className="text-slate-100 font-bold m-0 text-lg display-font">Login Bonus</h2>
              <p className="text-slate-400 text-sm m-0 mt-1 leading-snug">
                {hasClaimedSignIn ? 'You have synchronized for today. Return tomorrow for further gains.' : 'Synchronize your profile to log your activity and claim your base yield.'}
              </p>
            </div>
          </div>

          <button
            onClick={handleClaimSignIn}
            disabled={hasClaimedSignIn || claiming}
            className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap
              ${hasClaimedSignIn 
                ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed border border-slate-800' 
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_4px_20px_-5px_#06b6d4] hover:shadow-[0_4px_25px_-5px_#06b6d4] cursor-pointer'}`}
          >
            {claiming ? 'Synchronizing...' : hasClaimedSignIn ? <><CheckCircle2 size={16}/> Claimed</> : 'Claim +50 XP'}
          </button>
        </div>

        {/* Daily Diary (Save Point) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md transition-colors hover:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-slate-100 font-bold m-0 text-lg display-font flex items-center gap-3">
              <BookOpen size={20} className="text-purple-400" /> Daily Save Point
            </h2>
            <span className="text-xs font-mono text-slate-500">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <p className="text-sm text-slate-400 mb-4">Log your activities, reflections, or emotions for today. Saving automatically secures your Login Bonus.</p>
          <textarea
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 min-h-[120px] resize-y mb-4 placeholder-slate-600"
            placeholder="How did you spend your time today? What energized or drained you?"
            value={diaryText}
            onChange={e => { setDiaryText(e.target.value); setDiarySaved(false); }}
          />
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleSaveDiary}
              disabled={savingDiary || !diaryText.trim()}
              className="flex-1 px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white shadow-[0_4px_20px_-5px_#9333ea] hover:shadow-[0_4px_25px_-5px_#9333ea] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingDiary ? 'Saving...' : diarySaved ? <><CheckCircle2 size={16}/> Saved Successfully</> : 'Save Entry'}
            </button>
            
            <button
              onClick={handleGeneratePlan}
              disabled={generating || !diarySaved}
              className={`flex-1 px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 border 
                ${diarySaved ? 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border-cyan-500/30' : 'bg-slate-800/50 text-slate-600 border-slate-800'}`}
              title={diarySaved ? "Ask the AI to generate tomorrow's quests based on this log" : "Save your diary first"}
            >
              <Sparkles size={16} /> 
              {generating ? 'Focusing AI...' : 'Generate Next-Day Plan'}
            </button>
          </div>
        </div>

        {/* AI Quests Queue */}
        <AnimatePresence>
          {aiQuests.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-[0_0_30px_-5px_var(--accent-glow)] overflow-hidden"
            >
              <h2 className="text-xl font-bold text-slate-100 display-font m-0 mb-1 flex items-center gap-2">
                <Sparkles size={18} className="text-cyan-400" /> Tomorrow's Protocol
              </h2>
              <p className="text-sm text-slate-400 mb-5">
                The Architect has analyzed your log and recommends these objective routines. Accept them to automatically schedule them as Private Quests.
              </p>
              
              <div className="flex flex-col gap-4">
                {aiQuests.map((quest, idx) => {
                  const isAccepted = acceptedQuests.has(idx);
                  return (
                    <motion.div key={idx} className={`p-4 rounded-xl border ${isAccepted ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-slate-950 border-slate-800 hover:border-slate-700'} flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors`}>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded font-bold uppercase tracking-widest text-slate-400">{quest.skill_type}</span>
                          <span className="text-xs font-mono font-bold text-purple-400">+{quest.xp_reward} XP</span>
                          <span className="text-xs font-mono text-slate-500">{quest.duration_minutes}m</span>
                        </div>
                        <h3 className="text-slate-200 font-bold m-0">{quest.title}</h3>
                        <p className="text-sm text-slate-400 m-0 mt-1">{quest.description}</p>
                      </div>
                      <div className="shrink-0 flex items-center justify-center sm:justify-end">
                        <button 
                          onClick={() => acceptAiQuest(idx, quest)}
                          disabled={isAccepted}
                          className={`w-full sm:w-auto px-4 py-2 font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${isAccepted ? 'bg-cyan-600/20 text-cyan-400 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'}`}
                        >
                          {isAccepted ? <><CheckCircle2 size={16} /> Accepted</> : <><Plus size={16} /> Accept</>}
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Test My Luck Component */}
        <TestMyLuck 
          onRoll={rollLuck} 
          onComplete={() => setHasRolledToday(true)} 
          hasRolledToday={hasRolledToday}
          dailyLuck={dailyLuck}
          isGrindDay={isGrindDay}
        />
        
      </div>
      
      <style jsx>{`
        .display-font { font-family: 'Outfit', sans-serif; letter-spacing: -0.02em; }
      `}</style>
    </motion.div>
  );
}
