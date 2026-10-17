'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import {
  Swords, Target, User, LogOut, Trophy, Camera, ScrollText, Timer, Calendar, ShieldAlert
} from 'lucide-react';
import { motion } from 'framer-motion';

const BOTTOM_LINKS = [
  { href: '/dashboard/quests',      label: 'Quests',    icon: ScrollText  },
  { href: '/dashboard/discovery',   label: 'Analyze',   icon: Camera      },
  { href: '/dashboard',             label: 'Home',      icon: Swords      },
  { href: '/dashboard/focus',       label: 'Jail',      icon: Timer       },
  { href: '/dashboard/leaderboard', label: 'Rankings',  icon: Trophy      },
  { href: '/dashboard/dailies',     label: 'Daily',     icon: Calendar    },
  { href: '/dashboard/profile',     label: 'Profile',   icon: User        },
];

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useProfile();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      <header className="tropic-header">
        <Link href="/dashboard" className="tropic-logo">
          <div className="logo-icon-wrapper">
             <Target size={18} color="var(--accent)" />
          </div>
          <span className="display-font">LIFE Protocol</span>
        </Link>
        <button onClick={handleSignOut} className="tropic-signout">
          <LogOut size={16} />
        </button>
      </header>

      <div className="tropic-bottom-nav-container">
        <nav className="tropic-bottom-nav">
          {BOTTOM_LINKS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link key={href} href={href} className="nav-item">
                <div className={`icon-pill ${isActive ? 'active' : ''}`}>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                {isActive && (
                  <motion.div layoutId="nav-indicator" className="nav-indicator" />
                )}
              </Link>
            );
          })}
          
          {profile?.role === 'admin' && (
            <Link href="/dashboard/admin" className="nav-item">
              <div className={`icon-pill ${pathname.startsWith('/dashboard/admin') ? 'admin-active' : ''}`}>
                <ShieldAlert size={20} strokeWidth={pathname.startsWith('/dashboard/admin') ? 2.5 : 2} />
              </div>
              {pathname.startsWith('/dashboard/admin') && (
                <motion.div layoutId="nav-indicator" className="nav-indicator admin-indicator" />
              )}
            </Link>
          )}
        </nav>
      </div>

      <style jsx>{`
        .tropic-header {
          position: sticky; top: 0; z-index: 40;
          display: flex; justify-content: space-between; align-items: center;
          padding: 1.5rem 1.5rem 0.5rem;
          max-width: 600px; margin: 0 auto;
        }
        .tropic-logo {
          display: flex; align-items: center; gap: 10px;
          text-decoration: none; color: #fff;
          font-weight: 800; letter-spacing: 0.05em;
        }
        .logo-icon-wrapper {
          background: var(--accent-soft);
          border: 1px solid var(--border-accent);
          border-radius: 12px;
          padding: 8px;
          box-shadow: 0 4px 12px var(--accent-glow);
        }
        .tropic-signout {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-secondary);
          width: 40px; height: 40px; border-radius: 12px;
          display: flex; justify-content: center; align-items: center;
          cursor: pointer; transition: all 0.2s ease;
        }
        .tropic-signout:hover { background: rgba(255, 0, 0, 0.1); color: #ff3355; border-color: rgba(255,0,0,0.3); }
        
        .tropic-bottom-nav-container {
          position: fixed; bottom: 32px; left: 0; right: 0;
          display: flex; justify-content: center;
          z-index: 50; padding: 0 16px;
          pointer-events: none;
        }
        
        .tropic-bottom-nav {
          pointer-events: auto;
          display: flex; align-items: center; justify-content: space-between; gap: 4px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 32px;
          padding: 8px 12px;
          width: 100%; max-width: 400px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.15);
          backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
        }

        .nav-item {
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          text-decoration: none; position: relative;
          padding: 6px 4px; cursor: pointer; flex: 1;
        }

        .icon-pill {
          width: 52px; height: 40px; border-radius: 20px;
          display: flex; justify-content: center; align-items: center;
          color: var(--text-secondary);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }

        .icon-pill.active {
          background: var(--accent);
          color: #04091A;
          box-shadow: 0 6px 20px var(--accent-glow);
          transform: translateY(-4px);
        }

        .icon-pill.admin-active {
          background: #dc2626;
          color: #fff;
          box-shadow: 0 6px 20px rgba(220, 38, 38, 0.5);
          transform: translateY(-4px);
        }

        .nav-indicator {
          position: absolute; bottom: -6px; width: 6px; height: 6px;
          border-radius: 50%; background: var(--accent);
          box-shadow: 0 0 10px var(--accent-glow);
        }

        .nav-indicator.admin-indicator {
          background: #dc2626;
          box-shadow: 0 0 10px rgba(220, 38, 38, 0.8);
        }
      `}</style>
    </>
  );
}
