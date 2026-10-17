'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface AvatarShellProps {
  aura: number;
  level: number;
}

export default function AvatarShell({ aura, level }: AvatarShellProps) {
  let glowColor = 'rgba(0, 240, 255, '; // Default Cyan
  let auraState = 'Neutral';
  
  if (aura >= 100) {
    glowColor = 'rgba(255, 215, 0, '; // Legendary Gold
    auraState = 'Luminous';
  } else if (aura >= 50) {
    glowColor = 'rgba(0, 240, 255, '; // Tropic Cyan
    auraState = 'Radiant';
  } else if (aura >= 0) {
    glowColor = 'rgba(255, 0, 255, '; // Magenta
    auraState = 'Stable';
  } else {
    glowColor = 'rgba(255, 50, 80, '; // Danger Red
    auraState = 'Fractured';
  }

  return (
    <motion.div 
      className="avatar-shell-container tropic-card"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      style={{
        boxShadow: `0 12px 40px ${glowColor}0.3), inset 0 2px 0 rgba(255,255,255,0.2)`
      }}
    >
      <div className="avatar-header">
        <span className="avatar-status display-font" style={{ color: `${glowColor}1)` }}>
          Aura: {auraState}
        </span>
        <div className="avatar-level">LVL {level}</div>
      </div>

      <div className="avatar-stage">
        {/* Pulsing Aura Background */}
        <motion.div 
          className="aura-glow-bg"
          animate={{
            scale: [1, 1.05, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ background: `radial-gradient(circle, ${glowColor}0.4) 0%, transparent 60%)` }}
        />

        {/* Mock 2D SVG Character (Indie Kid Placeholder) */}
        <div className="character-svg-wrapper">
          <svg viewBox="0 0 200 300" className="mock-character" xmlns="http://www.w3.org/2000/svg">
            <rect x="70" y="120" width="60" height="80" rx="20" fill="#0A1435" stroke={`${glowColor}0.8)`} strokeWidth="2" />
            <circle cx="100" cy="80" r="45" fill="#fbd38d" />
            <path d="M55 80 Q100 0 145 80 Q100 40 55 80" fill={`${glowColor}1)`} />
            <circle cx="85" cy="85" r="5" fill="#1a202c" />
            <circle cx="115" cy="85" r="5" fill="#1a202c" />
            <path d="M90 100 Q100 110 110 100" stroke="#1a202c" strokeWidth="3" fill="none" strokeLinecap="round" />
            <rect x="45" y="130" width="20" height="60" rx="10" fill="#fbd38d" />
            <rect x="135" y="130" width="20" height="60" rx="10" fill="#fbd38d" />
            <rect x="75" y="200" width="20" height="50" rx="10" fill="#0A1435" />
            <rect x="105" y="200" width="20" height="50" rx="10" fill="#0A1435" />
          </svg>
        </div>
      </div>

      <style jsx>{`
        .avatar-shell-container {
          position: relative; width: 100%; min-height: 280px;
          display: flex; flex-direction: column; overflow: hidden;
          margin-bottom: 1.25rem;
          background: linear-gradient(180deg, var(--bg-card) 0%, var(--bg-primary) 100%);
        }
        .avatar-header {
          position: absolute; top: 16px; left: 16px; right: 16px;
          display: flex; justify-content: space-between; align-items: center; z-index: 10;
        }
        .avatar-status {
          font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; font-size: 0.75rem;
          text-shadow: 0 0 10px rgba(0,0,0,0.5);
        }
        .avatar-level {
          background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 12px;
          font-size: 0.75rem; font-weight: 700; color: #fff;
          border: 1px solid rgba(255,255,255,0.1); font-family: monospace;
        }
        .avatar-stage {
          flex: 1; display: flex; justify-content: center; align-items: flex-end;
          position: relative; padding-bottom: 20px;
        }
        .aura-glow-bg {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          z-index: 1; pointer-events: none;
        }
        .character-svg-wrapper {
          position: relative; z-index: 5; width: 140px; height: 210px;
          filter: drop-shadow(0 10px 20px rgba(0,0,0,0.4));
        }
        .mock-character { width: 100%; height: 100%; }
      `}</style>
    </motion.div>
  );
}
