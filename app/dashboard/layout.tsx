// app/dashboard/layout.tsx
'use client';
import React, { useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { supabase } from '@/lib/supabase';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    async function updateStreak() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.rpc('update_streak', { p_user_id: user.id });
      }
    }
    updateStreak();
  }, []);

  return (
    <div 
      className="dashboard-bg relative min-h-screen bg-cover bg-center bg-fixed"
      style={{ backgroundImage: "url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop')" }}
    >
      {/* Dark Readability Overlay */}
      <div className="absolute inset-0 bg-black/60 pointer-events-none z-0" />
      
      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar />
        <main className="max-w-3xl mx-auto w-full px-4 py-8 pb-32 flex flex-col gap-6 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
