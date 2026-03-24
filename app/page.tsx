// app/page.tsx
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase-server';

export default async function Home() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
