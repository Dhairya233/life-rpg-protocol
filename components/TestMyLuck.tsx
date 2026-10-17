'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, HelpCircle } from 'lucide-react';

interface TestMyLuckProps {
  onRoll: () => Promise<{ luck_value: number; is_grind_day: boolean } | null>;
  onComplete: () => void;
  hasRolledToday: boolean;
  dailyLuck: number | null;
  isGrindDay: boolean;
}

export default function TestMyLuck({ onRoll, onComplete, hasRolledToday, dailyLuck, isGrindDay }: TestMyLuckProps) {
  const [rolling, setRolling] = useState(false);
  const [revealed, setRevealed] = useState(hasRolledToday);
  const [result, setResult] = useState<{ luck_value: number; is_grind_day: boolean } | null>(
    hasRolledToday && dailyLuck !== null ? { luck_value: dailyLuck, is_grind_day: isGrindDay } : null
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(hasRolledToday ? 1 : null);

  React.useEffect(() => {
    if (hasRolledToday && dailyLuck !== null && !rolling) {
      setRevealed(true);
      setResult({ luck_value: dailyLuck, is_grind_day: isGrindDay });
      if (selectedIndex === null) setSelectedIndex(1);
    }
  }, [hasRolledToday, dailyLuck, isGrindDay, selectedIndex, rolling]);

  const handlePick = async (idx: number) => {
    if (rolling || revealed) return;
    setSelectedIndex(idx);
    setRolling(true);
    
    // Server roll
    const res = await onRoll();
    if (res) {
      setResult(res);
      setRevealed(true);
      setTimeout(() => {
        onComplete();
      }, 1000); // 1 second before notifying completion (no longer unmounts)
    } else {
      setRolling(false);
      setSelectedIndex(null);
    }
  };

  const adviceStr = () => {
    if (!result) return '';
    if (result.luck_value >= 80) return "The stars align. Tackle your hardest Legendary quest.";
    if (result.luck_value >= 60) return "Fortune favors the bold. Good day for creative work.";
    if (result.luck_value >= 40) return "A balanced day. Steady progress wins the race.";
    return "A Grind Day. Stick to easy tasks and rely on raw discipline.";
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md mb-6 w-full flex flex-col items-center">
      <div className="flex items-center gap-2 text-indigo-400 mb-2">
        <Sparkles size={20} />
        <h2 className="text-xl font-bold m-0 display-font">Test My Luck</h2>
      </div>
      <p className="text-sm text-slate-400 mb-6 text-center max-w-sm">
        {hasRolledToday ? "You have already completed your daily roll." : revealed ? "Your fate for today is sealed." : "Pick a mysterious card to determine your luck for the day."}
      </p>

      <div className="flex gap-4 mb-6">
        {[0, 1, 2].map(idx => {
          const isSelected = selectedIndex === idx;
          const isFlipped = revealed && isSelected;
          const isDisabled = revealed || rolling;
          
          return (
            <motion.div
              key={idx}
              className={`relative w-32 h-44 sm:w-24 sm:h-36 rounded-xl perspective-1000 
                ${!isDisabled ? 'cursor-pointer hover:shadow-cyan' : 'cursor-default'} 
                ${isDisabled && !isSelected ? 'opacity-30 grayscale scale-95' : ''}
              `}
              onClick={() => handlePick(idx)}
              whileHover={!isDisabled ? { y: -5 } : {}}
              layout
            >
              <motion.div
                className="w-full h-full preserve-3d absolute"
                initial={false}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
              >
                {/* Back of Card */}
                <div className="absolute w-full h-full backface-hidden rounded-xl border-2 border-slate-700 bg-slate-800 flex items-center justify-center flex-col gap-2">
                  <HelpCircle size={32} className="text-slate-500" />
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Pick One</span>
                </div>
                
                {/* Front of Card */}
                <div 
                  className="absolute w-full h-full backface-hidden rounded-xl border-2 flex items-center justify-center flex-col gap-1 rotate-y-180"
                  style={{ 
                    borderColor: result?.is_grind_day ? '#ff3355' : '#ffd700',
                    backgroundColor: result?.is_grind_day ? '#ff335522' : '#ffd70022'
                  }}
                >
                  <span className="text-3xl font-black" style={{ color: result?.is_grind_day ? '#ff3355' : '#ffd700' }}>
                    {result?.luck_value}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-slate-300">Luck</span>
                </div>
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {revealed && result && (
          <motion.div 
            className="text-center bg-slate-800/50 p-4 rounded-lg w-full"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="text-sm font-bold m-0 text-slate-200">Advice:</p>
            <p className="text-sm text-slate-300 italic m-0 mt-1">{adviceStr()}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <style jsx>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}
