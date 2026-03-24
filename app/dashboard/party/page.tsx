'use client';
// app/dashboard/party/page.tsx — Parties / Guilds Hub

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { Users, Plus, Search, Shield, Swords, X, Check, Crown, UserPlus } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────
interface Party {
  id: string;
  name: string;
  description: string | null;
  emblem: string;
  leader_id: string;
  max_members: number;
  aura_pool: number;
  xp_pool: number;
  is_recruiting: boolean;
  member_count?: number;
  leader_username?: string;
}

interface MyParty extends Party {
  role: 'leader' | 'officer' | 'member';
}

// ── Create Party Form ──────────────────────────────────────────
function CreatePartyForm({ userId, onCreated, onCancel }: {
  userId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName]   = useState('');
  const [desc, setDesc]   = useState('');
  const [emblem, setEmblem] = useState('⚔');
  const [max, setMax]     = useState(6);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const EMBLEMS = ['⚔','🛡','🔥','⚡','🌌','🏔','🐉','💀','🌙','⭐'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Party name is required.'); return; }
    setSaving(true);

    const { error: err } = await supabase.from('parties').insert({
      name: name.trim(),
      description: desc.trim() || null,
      emblem,
      leader_id: userId,
      max_members: max,
    });

    if (err) {
      setError(err.message.includes('unique') ? 'That party name is taken.' : err.message);
      setSaving(false);
      return;
    }

    // Auto-join as leader
    const { data: newParty } = await supabase
      .from('parties').select('id').eq('name', name.trim()).single();
    if (newParty) {
      await supabase.from('party_members').insert({
        party_id: newParty.id, user_id: userId, role: 'leader',
      });
    }
    onCreated();
  };

  return (
    <motion.form className="create-form" onSubmit={handleSubmit}
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="form-header">
        <h3 className="display-font form-title">Found a Party</h3>
        <button type="button" onClick={onCancel} className="form-close"><X size={16} /></button>
      </div>
      {error && <p className="form-error">{error}</p>}

      {/* Emblem picker */}
      <div className="emblem-row">
        {EMBLEMS.map(e => (
          <button key={e} type="button"
            className={`emblem-btn ${emblem === e ? 'emblem-active' : ''}`}
            onClick={() => setEmblem(e)}>{e}</button>
        ))}
      </div>

      <div className="form-fields">
        <div className="form-field">
          <label className="form-label">PARTY NAME *</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)}
            placeholder="The Iron Vanguard" maxLength={40} required />
        </div>
        <div className="form-field">
          <label className="form-label">DESCRIPTION</label>
          <textarea className="form-input form-textarea" value={desc}
            onChange={e => setDesc(e.target.value)} placeholder="What does your party stand for?" maxLength={200} rows={2} />
        </div>
        <div className="form-field">
          <label className="form-label">MAX MEMBERS (2–8)</label>
          <input type="number" className="form-input" value={max}
            onChange={e => setMax(Number(e.target.value))} min={2} max={8} />
        </div>
      </div>

      <button type="submit" className="form-submit" disabled={saving}>
        {saving ? 'Creating...' : <><Check size={14} /> Found Party</>}
      </button>
    </motion.form>
  );
}

// ── Party Card ─────────────────────────────────────────────────
function PartyCard({ party, myPartyId, onJoin }: {
  party: Party;
  myPartyId: string | null;
  onJoin: (id: string) => void;
}) {
  const isMine = myPartyId === party.id;
  const isFull = (party.member_count ?? 0) >= party.max_members;

  return (
    <motion.div className={`party-card ${isMine ? 'party-mine' : ''}`} layout whileHover={{ y: -1 }}>
      <div className="party-emblem">{party.emblem}</div>
      <div className="party-info">
        <div className="party-top">
          <span className="display-font party-name">{party.name}</span>
          {isMine && <span className="party-badge mine"><Crown size={10} /> My Party</span>}
          {party.is_recruiting && !isFull && !isMine && (
            <span className="party-badge recruiting"><UserPlus size={10} /> Recruiting</span>
          )}
        </div>
        {party.description && <p className="party-desc">{party.description}</p>}
        <div className="party-stats">
          <span className="party-stat"><Users size={11} /> {party.member_count ?? 0}/{party.max_members}</span>
          <span className="party-stat">✦ {party.aura_pool} pool</span>
          <span className="party-stat">⚡ {party.xp_pool.toLocaleString()} XP</span>
          {party.leader_username && <span className="party-stat"><Crown size={11} /> {party.leader_username}</span>}
        </div>
      </div>
      {!isMine && party.is_recruiting && !isFull && (
        <button className="join-btn" onClick={() => onJoin(party.id)}>
          <UserPlus size={13} /> Join
        </button>
      )}
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function PartyPage() {
  const { isClassic } = useTheme();

  const [parties, setParties]         = useState<Party[]>([]);
  const [myParty, setMyParty]         = useState<MyParty | null>(null);
  const [userId, setUserId]           = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [showCreate, setShowCreate]   = useState(false);
  const [joinFeedback, setJoinFeedback] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    // Load all parties with member count + leader username
    const { data: partiesRaw } = await supabase
      .from('parties')
      .select(`
        *,
        party_members(count),
        leader:profiles!parties_leader_id_fkey(username)
      `)
      .order('xp_pool', { ascending: false });

    if (partiesRaw) {
      const mapped = partiesRaw.map((p: any) => ({
        ...p,
        member_count:    p.party_members?.[0]?.count ?? 0,
        leader_username: p.leader?.username ?? 'Unknown',
      }));
      setParties(mapped);
    }

    // Load my party membership
    const { data: memberRow } = await supabase
      .from('party_members')
      .select('role, party:parties(*)')
      .eq('user_id', user.id)
      .single();

    if (memberRow) {
      setMyParty({ ...(memberRow.party as Party), role: memberRow.role as MyParty['role'] });
    } else {
      setMyParty(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleJoin = async (partyId: string) => {
    if (!userId) return;
    const { error } = await supabase.from('party_members').insert({
      party_id: partyId, user_id: userId, role: 'member',
    });
    if (error) {
      setJoinFeedback(error.message.includes('unique') ? 'Already a member.' : error.message);
    } else {
      setJoinFeedback('Joined! Welcome to the party.');
      await loadData();
    }
    setTimeout(() => setJoinFeedback(null), 3000);
  };

  const handleLeave = async () => {
    if (!userId || !myParty) return;
    await supabase.from('party_members').delete()
      .eq('user_id', userId).eq('party_id', myParty.id);
    setMyParty(null);
    await loadData();
  };

  const filtered = parties.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  if (loading) {
    return (
      <div className="party-loading">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="spinner" />
        <p className="display-font">Summoning Parties...</p>
      </div>
    );
  }

  return (
    <motion.div className="party-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="display-font page-title">⚔ Parties</h1>
          <p className="page-subtitle">{parties.length} parties · {parties.filter(p => p.is_recruiting).length} recruiting</p>
        </div>
        {!myParty && !showCreate && (
          <button className="found-btn" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Found Party
          </button>
        )}
      </div>

      {/* Feedback toast */}
      <AnimatePresence>
        {joinFeedback && (
          <motion.div className="toast" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {joinFeedback}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Form */}
      <AnimatePresence>
        {showCreate && userId && (
          <CreatePartyForm userId={userId}
            onCreated={() => { setShowCreate(false); loadData(); }}
            onCancel={() => setShowCreate(false)} />
        )}
      </AnimatePresence>

      {/* My Party Banner */}
      {myParty && (
        <motion.div className="my-party-banner" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="banner-left">
            <span className="banner-emblem">{myParty.emblem}</span>
            <div>
              <div className="banner-label">YOUR PARTY</div>
              <div className="display-font banner-name">{myParty.name}</div>
              <div className="banner-role">
                {myParty.role === 'leader' && <><Crown size={11} /> Leader</>}
                {myParty.role === 'officer' && <><Shield size={11} /> Officer</>}
                {myParty.role === 'member' && <><Swords size={11} /> Member</>}
              </div>
            </div>
          </div>
          <div className="banner-stats">
            <div className="banner-stat"><span className="stat-val">✦ {myParty.aura_pool}</span><span className="stat-lbl">AURA POOL</span></div>
            <div className="banner-stat"><span className="stat-val">⚡ {myParty.xp_pool.toLocaleString()}</span><span className="stat-lbl">XP POOL</span></div>
          </div>
          {myParty.role !== 'leader' && (
            <button className="leave-btn" onClick={handleLeave}>Leave</button>
          )}
        </motion.div>
      )}

      {/* Search */}
      <div className="search-bar">
        <Search size={15} className="search-icon" />
        <input className="search-input" placeholder="Search parties..." value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Party List */}
      <div className="parties-list">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div className="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p>No parties found. Be the first to found one!</p>
            </motion.div>
          ) : (
            filtered.map(p => (
              <PartyCard key={p.id} party={p} myPartyId={myParty?.id ?? null} onJoin={handleJoin} />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Coming Soon note */}
      <div className="coming-soon">
        <Shield size={12} /> Party Quests, shared raids, and guild wars — coming soon
      </div>

      <style jsx>{`
        .party-page { max-width: 700px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.1rem; }
        .party-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; gap: 12px; color: var(--text-secondary); }
        .spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--accent); }

        /* Header */
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; }
        .page-title { font-size: 1.3rem; margin: 0; color: var(--text-primary); }
        .page-subtitle { font-size: 0.78rem; color: var(--text-secondary); margin: 4px 0 0; font-family: var(--font-body); }
        .found-btn { display: flex; align-items: center; gap: 5px; padding: 8px 14px; border-radius: 10px; background: var(--accent); color: #000; border: none; font-size: 0.78rem; font-weight: 700; cursor: pointer; font-family: var(--font-body); transition: opacity 0.2s; }
        .found-btn:hover { opacity: 0.85; }

        /* Toast */
        .toast { padding: 10px 14px; border-radius: 10px; font-size: 0.8rem; font-weight: 600; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); font-family: var(--font-body); }

        /* Create form */
        .create-form { background: var(--bg-card); border: 1px solid var(--border-accent); border-radius: 16px; padding: 1.25rem; }
        .form-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .form-title { font-size: 0.95rem; margin: 0; color: var(--text-primary); }
        .form-close { background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; }
        .form-error { color: #ff3355; font-size: 0.78rem; margin: 0 0 10px; }
        .emblem-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
        .emblem-btn { width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary); font-size: 1.1rem; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
        .emblem-btn:hover { border-color: var(--border-accent); }
        .emblem-active { border-color: var(--accent); background: var(--accent-soft); }
        .form-fields { display: flex; flex-direction: column; gap: 10px; }
        .form-field { display: flex; flex-direction: column; gap: 4px; }
        .form-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; color: var(--text-secondary); opacity: 0.6; font-family: var(--font-body); }
        .form-input { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.82rem; font-family: var(--font-body); outline: none; }
        .form-input:focus { border-color: var(--border-accent); }
        .form-textarea { resize: vertical; min-height: 52px; }
        .form-submit { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 10px; border-radius: 10px; background: var(--accent); color: #000; border: none; font-size: 0.82rem; font-weight: 700; cursor: pointer; font-family: var(--font-body); margin-top: 14px; transition: opacity 0.2s; }
        .form-submit:disabled { opacity: 0.5; cursor: not-allowed; }

        /* My Party Banner */
        .my-party-banner { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 16px; background: var(--bg-card); border: 1px solid var(--accent); ${isClassic ? 'box-shadow: 0 0 20px rgba(74,247,255,0.1);' : ''} }
        .banner-left { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
        .banner-emblem { font-size: 2rem; flex-shrink: 0; }
        .banner-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-secondary); opacity: 0.5; font-family: var(--font-body); }
        .banner-name { font-size: 1.1rem; color: var(--text-primary); margin: 2px 0; }
        .banner-role { display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--text-secondary); font-family: var(--font-body); }
        .banner-stats { display: flex; gap: 16px; }
        .banner-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .stat-val { font-size: 0.85rem; font-weight: 700; color: var(--text-primary); font-family: monospace; }
        .stat-lbl { font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-secondary); opacity: 0.45; }
        .leave-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: 0.72rem; font-weight: 600; cursor: pointer; font-family: var(--font-body); transition: all 0.2s; }
        .leave-btn:hover { border-color: #ff3355; color: #ff3355; }

        /* Search */
        .search-bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; background: var(--bg-card); border: 1px solid var(--border); }
        .search-icon { color: var(--text-secondary); opacity: 0.4; flex-shrink: 0; }
        .search-input { flex: 1; border: none; outline: none; background: transparent; color: var(--text-primary); font-size: 0.82rem; font-family: var(--font-body); }
        .search-input::placeholder { color: var(--text-secondary); opacity: 0.4; }

        /* Party List */
        .parties-list { display: flex; flex-direction: column; gap: 8px; }
        .party-card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 14px; background: var(--bg-card); border: 1px solid var(--border); transition: border-color 0.2s; }
        .party-card:hover { border-color: var(--border-accent); }
        .party-mine { border-color: var(--accent) !important; }
        .party-emblem { font-size: 1.8rem; flex-shrink: 0; width: 44px; text-align: center; }
        .party-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .party-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .party-name { font-size: 0.95rem; color: var(--text-primary); }
        .party-badge { display: flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 6px; font-size: 0.6rem; font-weight: 700; font-family: var(--font-body); }
        .mine { background: rgba(74,247,255,0.1); color: var(--accent); }
        .recruiting { background: rgba(105,255,150,0.1); color: #69ff96; }
        .party-desc { font-size: 0.75rem; color: var(--text-secondary); margin: 0; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .party-stats { display: flex; gap: 10px; flex-wrap: wrap; }
        .party-stat { display: flex; align-items: center; gap: 3px; font-size: 0.65rem; color: var(--text-secondary); font-family: monospace; }
        .join-btn { display: flex; align-items: center; gap: 4px; padding: 7px 13px; border-radius: 9px; background: var(--accent-soft); border: 1px solid var(--border-accent); color: var(--accent); font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: var(--font-body); transition: all 0.2s; flex-shrink: 0; }
        .join-btn:hover { background: var(--accent); color: #000; }

        /* Empty */
        .empty { text-align: center; padding: 2rem; color: var(--text-secondary); font-size: 0.85rem; }

        /* Coming soon */
        .coming-soon { display: flex; align-items: center; gap: 6px; font-size: 0.68rem; color: var(--text-secondary); opacity: 0.35; font-family: var(--font-body); justify-content: center; padding: 0.5rem; }
      `}</style>
    </motion.div>
  );
}
