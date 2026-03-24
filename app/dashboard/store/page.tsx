'use client';
// app/dashboard/store/page.tsx — Aura Sink Marketplace

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { useProfile } from '@/hooks/useProfile';
import { ShoppingBag, Zap, Tag, Users, Sparkles, Check } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────
interface StoreItem {
  id: string;
  name: string;
  description: string | null;
  category: 'cosmetic' | 'boost' | 'title' | 'party';
  aura_cost: number;
  icon: string;
  is_available: boolean;
  effect_meta: Record<string, unknown> | null;
}

interface Purchase {
  item_id: string;
  purchased_at: string;
  expires_at: string | null;
}

type CategoryFilter = 'all' | 'cosmetic' | 'boost' | 'title' | 'party';

// ── Category metadata ──────────────────────────────────────────
const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  cosmetic: { label: 'Cosmetic',  icon: <Sparkles size={13} />, color: '#9b59ff' },
  boost:    { label: 'Boosts',    icon: <Zap      size={13} />, color: '#ffd700' },
  title:    { label: 'Titles',    icon: <Tag      size={13} />, color: '#4af7ff' },
  party:    { label: 'Party',     icon: <Users    size={13} />, color: '#69ff96' },
};

// ── Store Item Card ────────────────────────────────────────────
function ItemCard({ item, owned, currentAura, onBuy, buying }: {
  item: StoreItem;
  owned: boolean;
  currentAura: number;
  onBuy: (id: string) => void;
  buying: boolean;
}) {
  const cat     = CATEGORY_META[item.category];
  const canAfford = currentAura >= item.aura_cost;

  return (
    <motion.div
      className={`item-card ${owned ? 'item-owned' : ''} ${!canAfford && !owned ? 'item-poor' : ''}`}
      whileHover={!owned ? { y: -2 } : {}}
      layout
    >
      <div className="item-icon">{item.icon}</div>
      <div className="item-body">
        <div className="item-top">
          <span className="display-font item-name">{item.name}</span>
          <span className="item-cat" style={{ color: cat.color }}>
            {cat.icon} {cat.label}
          </span>
        </div>
        {item.description && <p className="item-desc">{item.description}</p>}
        {item.effect_meta && 'xp_multiplier' in item.effect_meta && (
          <span className="item-effect">⚡ {String(item.effect_meta.xp_multiplier)}× XP multiplier</span>
        )}
        {item.effect_meta && 'duration_days' in item.effect_meta && (
          <span className="item-effect">⏱ {String(item.effect_meta.duration_days)} day effect</span>
        )}
      </div>
      <div className="item-right">
        <span className="item-cost">✦ {item.aura_cost}</span>
        {owned ? (
          <span className="owned-badge"><Check size={11} /> Owned</span>
        ) : (
          <motion.button
            className="buy-btn"
            onClick={() => onBuy(item.id)}
            disabled={!canAfford || buying}
            style={canAfford ? {} : { opacity: 0.35, cursor: 'not-allowed' }}
            whileTap={canAfford ? { scale: 0.95 } : {}}
          >
            {buying ? '...' : 'Buy'}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function StorePage() {
  const { isClassic } = useTheme();
  const { profile }    = useProfile();

  const [items, setItems]           = useState<StoreItem[]>([]);
  const [purchases, setPurchases]   = useState<Purchase[]>([]);
  const [loading, setLoading]       = useState(true);
  const [catFilter, setCatFilter]   = useState<CategoryFilter>('all');
  const [buying, setBuying]         = useState<string | null>(null);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: storeData }, { data: purchaseData }] = await Promise.all([
      supabase.from('store_items').select('*').eq('is_available', true).order('aura_cost'),
      supabase.from('user_purchases').select('item_id, purchased_at, expires_at').eq('user_id', user.id),
    ]);

    setItems((storeData ?? []) as StoreItem[]);
    setPurchases((purchaseData ?? []) as Purchase[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const ownedIds = new Set(purchases
    .filter(p => !p.expires_at || new Date(p.expires_at) > new Date())
    .map(p => p.item_id)
  );

  const handleBuy = async (itemId: string) => {
    if (!profile) return;
    setBuying(itemId);

    const { data, error } = await supabase.rpc('purchase_store_item', {
      p_user_id: profile.id,
      p_item_id: itemId,
    });

    if (error || data?.error) {
      showToast(data?.error ?? 'Purchase failed.', false);
    } else {
      showToast(`Purchased "${data.item}" for ✦${data.spent} Aura!`, true);
      await loadData();
    }
    setBuying(null);
  };

  const filtered = items.filter(i => catFilter === 'all' || i.category === catFilter);

  // Aura balance from profile (live via useProfile's realtime)
  const aura = profile?.aura ?? 0;

  if (loading) {
    return (
      <div className="store-loading">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="spinner" />
        <p className="display-font">Opening the Store...</p>
      </div>
    );
  }

  return (
    <motion.div className="store-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      {/* Header */}
      <div className="store-header">
        <div>
          <h1 className="display-font store-title"><ShoppingBag size={20} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />Aura Store</h1>
          <p className="store-subtitle">Spend your Aura on perks. All purchases are permanent sinks — choose wisely.</p>
        </div>
        <div className="aura-balance" style={{ boxShadow: isClassic ? '0 0 14px rgba(74,247,255,0.2)' : 'none' }}>
          <span className="balance-icon">✦</span>
          <div>
            <div className="balance-val">{aura.toLocaleString()}</div>
            <div className="balance-lbl">AURA</div>
          </div>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div className={`toast ${toast.ok ? 'toast-ok' : 'toast-err'}`}
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Filter */}
      <div className="cat-tabs">
        {(['all', 'boost', 'title', 'cosmetic', 'party'] as CategoryFilter[]).map(c => (
          <button key={c} className={`cat-tab ${catFilter === c ? 'cat-active' : ''}`}
            onClick={() => setCatFilter(c)}
            style={catFilter === c && c !== 'all' ? { borderColor: CATEGORY_META[c]?.color, color: CATEGORY_META[c]?.color } : {}}>
            {c === 'all' ? '✦ All' : <>{CATEGORY_META[c].icon} {CATEGORY_META[c].label}</>}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="items-list">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div className="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p>No items in this category yet.</p>
            </motion.div>
          ) : (
            filtered.map(item => (
              <ItemCard key={item.id} item={item} owned={ownedIds.has(item.id)}
                currentAura={aura} onBuy={handleBuy} buying={buying === item.id} />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Economy note */}
      <div className="economy-note">
        ✦ Aura spent here is permanently removed from circulation — keeping the economy healthy
      </div>

      <style jsx>{`
        .store-page { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.1rem; }
        .store-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; gap: 12px; color: var(--text-secondary); }
        .spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--accent); }

        /* Header */
        .store-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
        .store-title { font-size: 1.3rem; margin: 0; color: var(--text-primary); }
        .store-subtitle { font-size: 0.78rem; color: var(--text-secondary); margin: 4px 0 0; font-family: var(--font-body); max-width: 360px; }
        .aura-balance { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 14px; background: var(--bg-card); border: 1px solid var(--border); flex-shrink: 0; }
        .balance-icon { font-size: 1.4rem; color: var(--accent); }
        .balance-val { font-size: 1.2rem; font-weight: 900; color: var(--text-primary); font-family: monospace; line-height: 1; }
        .balance-lbl { font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-secondary); opacity: 0.45; margin-top: 2px; }

        /* Toast */
        .toast { padding: 10px 14px; border-radius: 10px; font-size: 0.8rem; font-weight: 600; font-family: var(--font-body); }
        .toast-ok { background: rgba(105,255,150,0.1); border: 1px solid rgba(105,255,150,0.3); color: #69ff96; }
        .toast-err { background: rgba(255,51,85,0.08); border: 1px solid rgba(255,51,85,0.25); color: #ff3355; }

        /* Tabs */
        .cat-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
        .cat-tab { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: 0.72rem; font-weight: 700; cursor: pointer; transition: all 0.15s; font-family: var(--font-body); }
        .cat-tab:hover { border-color: var(--border-accent); }
        .cat-active { background: var(--bg-card); color: var(--text-primary); }

        /* Items */
        .items-list { display: flex; flex-direction: column; gap: 8px; }
        .item-card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 14px; background: var(--bg-card); border: 1px solid var(--border); transition: border-color 0.2s; }
        .item-card:hover { border-color: var(--border-accent); }
        .item-owned { opacity: 0.55; }
        .item-icon { font-size: 1.8rem; flex-shrink: 0; width: 42px; text-align: center; }
        .item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .item-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .item-name { font-size: 0.92rem; color: var(--text-primary); }
        .item-cat { display: flex; align-items: center; gap: 3px; font-size: 0.65rem; font-weight: 700; font-family: var(--font-body); }
        .item-desc { font-size: 0.75rem; color: var(--text-secondary); margin: 0; opacity: 0.75; }
        .item-effect { font-size: 0.65rem; color: var(--text-secondary); font-family: monospace; opacity: 0.65; }
        .item-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
        .item-cost { font-size: 1rem; font-weight: 900; color: var(--accent); font-family: monospace; }
        .owned-badge { display: flex; align-items: center; gap: 3px; font-size: 0.65rem; color: #69ff96; font-weight: 700; font-family: var(--font-body); }
        .buy-btn { padding: 7px 14px; border-radius: 9px; background: var(--accent); color: #000; border: none; font-size: 0.75rem; font-weight: 700; cursor: pointer; font-family: var(--font-body); transition: opacity 0.2s; }
        .buy-btn:hover:not(:disabled) { opacity: 0.85; }

        /* Empty */
        .empty { text-align: center; padding: 2rem; color: var(--text-secondary); font-size: 0.85rem; }

        /* Economy note */
        .economy-note { text-align: center; font-size: 0.65rem; color: var(--text-secondary); opacity: 0.3; padding: 0.5rem; font-family: var(--font-body); }

        @media (max-width: 480px) {
          .store-header { flex-direction: column; }
          .aura-balance { align-self: stretch; justify-content: center; }
        }
      `}</style>
    </motion.div>
  );
}
