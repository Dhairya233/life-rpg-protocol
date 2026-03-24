'use client';
// app/dashboard/jury/page.tsx

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { useJuryQueue } from '@/hooks/useJuryQueue';
import JuryCard from '@/components/JuryCard';

export default function JuryPage() {
  const { isClassic } = useTheme();
  const { queue, loading, ourAura, removeFromQueue } = useJuryQueue();
  const [errorObj, setErrorObj] = useState<{id: string, msg: string} | null>(null);

  const handleVote = async (userQuestId: string, approve: boolean): Promise<boolean> => {
    try {
      setErrorObj(null);
      const res = await fetch('/api/jury/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userQuestId, vote: approve })
      });

      const data = await res.json();
      
      if (!res.ok) {
        setErrorObj({ id: userQuestId, msg: data.error || 'Failed to submit vote' });
        return false;
      }

      // Vote successful, remove from queue after a short delay for animation
      setTimeout(() => {
        removeFromQueue(userQuestId);
      }, 1500);
      
      return true;
    } catch (err) {
      setErrorObj({ id: userQuestId, msg: 'Network error. Try again.' });
      return false;
    }
  };

  if (loading) {
    return (
      <div className="jury-loading">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="spinner" />
        <p className="display-font" style={{ color: 'var(--text-secondary)' }}>Summoning the Jury...</p>
      </div>
    );
  }

  return (
    <motion.div 
      className="jury-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="jury-header">
        <div>
          <h1 className="display-font jury-title">⚖ The Jury</h1>
          <p className="jury-subtitle">
            Review peer submissions. Match the community verdict to earn +10 XP and +2 Aura. Your Aura determines your voting power.
          </p>
        </div>
        <div className="aura-display">
          <span className="aura-label">Your Voting Weight</span>
          <span className="aura-value display-font">{ourAura} <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Aura</span></span>
        </div>
      </div>

      {/* Queue */}
      <div className="jury-queue">
        <AnimatePresence mode="popLayout">
          {queue.length > 0 ? (
            queue.map((item) => (
              <div key={item.userQuest.id} className="card-wrapper">
                <JuryCard 
                  item={item} 
                  ourAura={ourAura} 
                  onVote={handleVote} 
                />
                {errorObj?.id === item.userQuest.id && (
                  <p className="error-text">⚠ {errorObj.msg}</p>
                )}
              </div>
            ))
          ) : (
            <motion.div 
              className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-md flex flex-col items-center justify-center text-center gap-3 text-slate-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="text-4xl mb-2 opacity-80">🕊</div>
              <h3 className="text-slate-200 font-bold text-xl m-0">The queue is empty</h3>
              <p className="text-sm m-0 max-w-sm">There are no pending submissions awaiting your review at this time. Go grind some quests!</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style jsx>{`
        .jury-page { max-width: 700px; margin: 0 auto; }
        .jury-loading {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-height: 50vh; gap: 16px;
        }
        .spinner {
          width: 32px; height: 32px; border-radius: 50%;
          border: 3px solid var(--border); border-top-color: var(--accent);
        }

        /* Header */
        .jury-header {
          display: flex; justify-content: space-between; align-items: flex-end;
          margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;
        }
        .jury-title { font-size: 1.5rem; margin: 0; color: var(--text-primary); }
        .jury-subtitle {
          font-size: 0.85rem; color: var(--text-secondary); margin: 6px 0 0;
          font-family: var(--font-body);
        }
        .aura-display {
          background: rgba(74, 247, 255, 0.05); border: 1px solid rgba(74, 247, 255, 0.2);
          padding: 8px 16px; border-radius: 12px; display: flex; flex-direction: column;
          align-items: flex-end; min-width: 140px;
          ${isClassic ? 'box-shadow: 0 0 20px rgba(74, 247, 255, 0.05);' : ''}
        }
        .aura-label { font-size: 0.65rem; color: #4af7ff; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
        .aura-value { font-size: 1.4rem; color: #4af7ff; margin: 0; text-shadow: 0 0 10px rgba(74,247,255,0.4); }

        /* Queue */
        .jury-queue { display: flex; flex-direction: column; gap: 1.5rem; }
        .card-wrapper { display: flex; flex-direction: column; gap: 8px; }
        .error-text { color: #ff3355; font-size: 0.8rem; text-align: center; margin: 0; }

        @media (max-width: 600px) {
          .jury-header { flex-direction: column; align-items: flex-start; }
          .aura-display { align-items: flex-start; width: 100%; }
        }
      `}</style>
    </motion.div>
  );
}
