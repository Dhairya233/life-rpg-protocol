// lib/focus-tiers.ts
// Single source of truth for Focus Tier configurations.
// Imported by focus page (UI) and any server-side RPC lookup.

export interface FocusTier {
  id:       string;
  label:    string;
  minutes:  number;
  xp:       number;
  aura:     number;
  color:    string;
  desc:     string;
}

export const FOCUS_TIERS: FocusTier[] = [
  { id: 'sprint',    label: 'Sprint',    minutes: 25,  xp: 150,  aura: 5,  color: '#69ff96', desc: 'Quick burst. 25 focused minutes.'           },
  { id: 'session',   label: 'Session',   minutes: 50,  xp: 350,  aura: 15, color: '#4af7ff', desc: 'Solid block. One Pomodoro double.'           },
  { id: 'deep',      label: 'Deep Work', minutes: 90,  xp: 700,  aura: 40, color: '#9b59ff', desc: 'Flow state territory. No distractions.'      },
  { id: 'legendary', label: 'Legendary', minutes: 120, xp: 1200, aura: 80, color: '#ffd700', desc: 'Two hours. Only the worthy survive.'          },
];

export type FocusTierId = FocusTier['id'];

export function getTier(id: string): FocusTier {
  return FOCUS_TIERS.find(t => t.id === id) ?? FOCUS_TIERS[0];
}
