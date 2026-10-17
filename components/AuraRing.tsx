'use client';
// components/AuraRing.tsx
// ============================================================
// Glowing SVG Aura Ring — the centrepiece of the Character Sheet
// ============================================================

import { motion } from 'framer-motion';
import { auraColors, auraRank } from '@/lib/rpg-engine';

interface AuraRingProps {
  aura: number;        // 0 – 1000
  username: string;
  avatarUrl?: string;
  size?: number;       // diameter in px, default 200
}

export default function AuraRing({
  aura,
  username,
  avatarUrl,
  size = 200,
}: AuraRingProps) {
  const [innerColor, glowColor] = auraColors(aura);
  const rank = auraRank(aura);

  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = size * 0.055;
  const r = (size - strokeWidth * 2) / 2 - 4;
  const circumference = 2 * Math.PI * r;

  // Fill arc proportional to aura (0–1000 maps to 0–100%)
  const fillFraction = aura / 1000;
  const dashOffset = circumference * (1 - fillFraction);

  const filterId = `aura-glow-${Math.round(aura)}`;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Multi-layer glow filter */}
          <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur1" />
            <feGaussianBlur stdDeviation="8" result="blur2" />
            <feGaussianBlur stdDeviation="16" result="blur3" />
            <feMerge>
              <feMergeNode in="blur3" />
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Gradient along the arc */}
          <linearGradient id={`grad-${filterId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={glowColor}  />
            <stop offset="100%" stopColor={innerColor} />
          </linearGradient>
        </defs>

        {/* Track ring (dim background arc) */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />

        {/* Animated fill arc */}
        <motion.circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={`url(#grad-${filterId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.6, ease: 'easeOut', delay: 0.3 }}
          transform={`rotate(-90 ${cx} ${cy})`}
          filter={`url(#${filterId})`}
        />

        {/* Outer pulse ring (animated glow) */}
        <motion.circle
          cx={cx} cy={cy} r={r + strokeWidth / 2 + 2}
          fill="none"
          stroke={glowColor}
          strokeWidth={1.5}
          strokeOpacity={0.4}
          animate={{ strokeOpacity: [0.4, 0.1, 0.4], r: [r + strokeWidth / 2 + 2, r + strokeWidth / 2 + 8, r + strokeWidth / 2 + 2] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      </svg>

      {/* Centre content: avatar + labels */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-1">
        {/* Avatar */}
        <div
          className="rounded-full overflow-hidden flex items-center justify-center bg-white/10 border-2"
          style={{
            width: size * 0.42,
            height: size * 0.42,
            borderColor: innerColor,
            boxShadow: `0 0 12px ${glowColor}66`,
          }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
          ) : (
            <span
              className="font-bold select-none"
              style={{ fontSize: size * 0.18, color: innerColor }}
            >
              {username.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Aura value */}
        <motion.span
          className="font-mono font-bold tracking-widest"
          style={{ fontSize: size * 0.082, color: innerColor, textShadow: `0 0 8px ${glowColor}` }}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          {aura.toLocaleString()}
        </motion.span>

        {/* Rank label */}
        <motion.span
          className="text-xs font-semibold tracking-[0.2em] uppercase opacity-70"
          style={{ color: innerColor, fontSize: size * 0.056 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 1 }}
        >
          {rank}
        </motion.span>
      </div>
    </div>
  );
}
