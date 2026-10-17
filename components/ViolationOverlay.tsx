'use client';
// components/ViolationOverlay.tsx

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface ViolationOverlayProps {
  active: boolean;
  graceSeconds?: number;
}

export default function ViolationOverlay({ active, graceSeconds = 10 }: ViolationOverlayProps) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="violation-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="violation-scanline" />
          
          <motion.div 
            className="violation-content"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            <div className="warning-icon-wrapper">
              <motion.div
                animate={{ opacity: [1, 0.5, 1], scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <AlertTriangle size={64} className="warning-icon" />
              </motion.div>
            </div>
            
            <h2 className="display-font warning-title">FOCUS LOST</h2>
            <p className="warning-desc">
              Return to the application immediately.
            </p>
            <div className="warning-grace">
              <p>Aura penalty in</p>
              <div className="grace-bar-container">
                <motion.div 
                  className="grace-bar-fill"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: graceSeconds, ease: 'linear' }}
                />
              </div>
            </div>
          </motion.div>

          <style jsx>{`
            .violation-overlay {
              position: fixed;
              top: 0; left: 0; right: 0; bottom: 0;
              background: rgba(20, 0, 0, 0.9);
              backdrop-filter: blur(10px);
              z-index: 9999;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .violation-scanline {
              position: absolute;
              top: 0; left: 0; right: 0; bottom: 0;
              background: linear-gradient(
                to bottom,
                rgba(255, 51, 85, 0) 0%,
                rgba(255, 51, 85, 0.1) 50%,
                rgba(255, 51, 85, 0) 100%
              );
              background-size: 100% 4px;
              z-index: 0;
              pointer-events: none;
            }
            .violation-content {
              position: relative;
              z-index: 1;
              background: #110000;
              border: 2px solid #ff3355;
              padding: 3rem 4rem;
              border-radius: 24px;
              text-align: center;
              box-shadow: 0 0 50px rgba(255, 51, 85, 0.4), inset 0 0 20px rgba(255, 51, 85, 0.2);
            }
            .warning-icon-wrapper {
              display: flex; justify-content: center; margin-bottom: 24px;
            }
            .warning-icon { color: #ff3355; filter: drop-shadow(0 0 10px rgba(255,51,85,0.8)); }
            .warning-title { 
              color: #ff3355; font-size: 2.5rem; margin: 0 0 16px;
              letter-spacing: 0.2em; text-shadow: 0 0 15px rgba(255,51,85,0.6);
            }
            .warning-desc {
              color: #ff99aa; font-size: 1.1rem; margin: 0 0 32px;
            }
            .warning-grace {
              display: flex; flex-direction: column; gap: 8px;
              color: #ff3355; font-size: 0.9rem; font-weight: 600; text-transform: uppercase;
              letter-spacing: 0.1em;
            }
            .grace-bar-container {
              width: 100%; height: 6px; background: #330000;
              border-radius: 3px; overflow: hidden;
            }
            .grace-bar-fill {
              height: 100%; background: #ff3355;
              box-shadow: 0 0 10px #ff3355;
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
