'use client';
// components/JuryCard.tsx

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import type { PendingVerificationItem } from '@/hooks/useJuryQueue';
import { SKILL_TYPE_LABELS, DIFFICULTY_COLORS } from '@/types/rpg';
import { Check, X, Shield, ExternalLink, Image as ImageIcon } from 'lucide-react';

interface JuryCardProps {
  item: PendingVerificationItem;
  ourAura: number;
  onVote: (userQuestId: string, approve: boolean) => Promise<boolean>;
}

export default function JuryCard({ item, ourAura, onVote }: JuryCardProps) {
  const { isClassic } = useTheme();
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState<'approve' | 'reject' | null>(null);

  const { quest, userQuest, submitter } = item;
  const diffColor = DIFFICULTY_COLORS[quest.difficulty];
  const skill = SKILL_TYPE_LABELS[quest.skill_type];

  // Supabase storage gives us public URLs if the bucket is public, 
  // but "submissions" bucket was created with TRUE or FALSE? 
  // We can just get publicUrl since RLS read policy allows all.
  const { data: { publicUrl } } = supabase.storage
    .from('submissions')
    .getPublicUrl(userQuest.proof_url || '');

  const handleVote = async (approve: boolean) => {
    setVoting(true);
    const success = await onVote(userQuest.id, approve);
    if (success) {
      setVoted(approve ? 'approve' : 'reject');
    } else {
      setVoting(false);
    }
  };

  return (
    <motion.div 
      className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-5 overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      layout
    >
      {/* Header */}
      <div className="flex flex-row items-center gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${diffColor}20` }}>
          <span className="text-2xl">{skill.emoji}</span>
        </div>
        <div className="flex flex-col gap-1 w-full">
          <h3 className="text-slate-200 font-bold text-lg m-0 leading-tight">{quest.title}</h3>
          <div className="flex flex-row items-center gap-3 flex-wrap">
            <span className="text-xs px-2 py-1 rounded-md font-bold uppercase tracking-wider" style={{ background: diffColor, color: quest.difficulty === 'hard' ? '#fff' : '#000' }}>
              {quest.difficulty}
            </span>
            <span className="text-xs text-slate-400 flex flex-row items-center gap-2">
              Submitted by <span className="text-slate-200 font-bold">{submitter.username}</span> 
              <span className="bg-slate-800 px-2 py-1 rounded font-mono text-[10px]">Lvl {submitter.level}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Proof Viewer */}
      <div className="proof-viewer">
        {userQuest.proof_url ? (
          <div className="proof-image-wrapper">
             {/* Note: In a real app we might use object-fit cover or auto, using img for simplicity */}
            <img src={publicUrl} alt="Quest Proof" className="proof-image" loading="lazy" />
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="fullscreen-btn">
              <ExternalLink size={14} /> Full Size
            </a>
          </div>
        ) : (
          <div className="no-proof">
            <ImageIcon size={32} opacity={0.2} />
            <p>No proof attached to this submission.</p>
          </div>
        )}
      </div>

      {/* Voting Actions */}
      <AnimatePresence mode="wait">
        {!voted ? (
          <motion.div className="vote-actions" key="actions" exit={{ opacity: 0 }}>
            <div className="vote-weight">
              <Shield size={12} /> Your Vote Weight: <strong>{ourAura} Aura</strong>
            </div>
            <div className="btn-group">
              <button 
                className="vote-btn reject" 
                onClick={() => handleVote(false)}
                disabled={voting}
              >
                {voting ? '...' : <><X size={16} /> REJECT</>}
              </button>
              <button 
                className="vote-btn approve" 
                onClick={() => handleVote(true)}
                disabled={voting}
              >
                {voting ? '...' : <><Check size={16} /> APPROVE</>}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            className={`vote-result ${voted}`}
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            {voted === 'approve' ? (
              <><Check size={20} /> You approved this submission</>
            ) : (
              <><X size={20} /> You rejected this submission</>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .error-text { color: #ff3355; font-size: 0.8rem; text-align: center; margin: 0; }

        /* Proof Viewer */
        .proof-viewer {
          display: flex; flex-direction: column; gap: 12px;
        }
        .proof-image-wrapper {
          position: relative; width: 100%; border-radius: 12px;
          overflow: hidden; background: #000;
          display: flex; justify-content: center; align-items: center;
          max-height: 400px;
        }
        .proof-image {
          max-width: 100%; max-height: 400px; object-fit: contain;
        }
        .fullscreen-btn {
          position: absolute; top: 10px; right: 10px;
          background: rgba(0,0,0,0.6); color: #fff; padding: 6px 10px;
          border-radius: 6px; font-size: 0.7rem; font-weight: 600;
          display: flex; align-items: center; gap: 4px; text-decoration: none;
          backdrop-filter: blur(4px); transition: background 0.2s;
        }
        .fullscreen-btn:hover { background: rgba(0,0,0,0.8); }
        .no-proof {
          height: 150px; display: flex; flex-direction: column; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px dashed var(--border);
          color: var(--text-secondary); gap: 8px; font-size: 0.8rem;
        }
        .proof-note {
          background: var(--bg-secondary); padding: 12px; border-radius: 8px;
          border-left: 2px solid var(--accent);
        }
        .note-label { font-size: 0.7rem; color: var(--text-secondary); margin: 0 0 4px; }
        .note-text { font-size: 0.85rem; color: var(--text-primary); margin: 0; font-style: italic; }

        /* Actions */
        .vote-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
        .vote-weight {
          font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 6px;
          justify-content: center; padding-bottom: 4px;
        }
        .btn-group { display: flex; gap: 10px; }
        .vote-btn {
          flex: 1; display: flex; justify-content: center; align-items: center; gap: 8px;
          padding: 12px; border-radius: 10px; font-weight: 800; font-size: 0.85rem;
          border: 1px solid transparent; cursor: pointer; transition: all 0.2s;
          letter-spacing: 0.05em; color: #fff;
        }
        .vote-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .vote-btn.approve {
          background: rgba(105, 255, 150, 0.1); border-color: rgba(105, 255, 150, 0.3); color: #69ff96;
        }
        .vote-btn.approve:hover:not(:disabled) {
          background: rgba(105, 255, 150, 0.2); border-color: #69ff96;
          ${isClassic ? 'box-shadow: 0 0 15px rgba(105,255,150,0.2);' : ''}
        }
        .vote-btn.reject {
          background: rgba(255, 51, 85, 0.1); border-color: rgba(255, 51, 85, 0.3); color: #ff3355;
        }
        .vote-btn.reject:hover:not(:disabled) {
          background: rgba(255, 51, 85, 0.2); border-color: #ff3355;
          ${isClassic ? 'box-shadow: 0 0 15px rgba(255,51,85,0.2);' : ''}
        }

        .vote-result {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 16px; border-radius: 12px; font-weight: 700; font-size: 0.9rem;
        }
        .vote-result.approve { background: rgba(105, 255, 150, 0.1); color: #69ff96; }
        .vote-result.reject { background: rgba(255, 51, 85, 0.1); color: #ff3355; }
      `}</style>
    </motion.div>
  );
}
