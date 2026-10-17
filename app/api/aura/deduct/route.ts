// app/api/aura/deduct/route.ts
// Secure API route for deducting aura

import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { amount, reason } = body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid deduction amount' }, { status: 400 });
    }

    if (!reason || typeof reason !== 'string') {
      return NextResponse.json({ error: 'Invalid deduction reason' }, { status: 400 });
    }

    // Call the deduct_aura RPC securely
    const { data: newAura, error } = await supabase.rpc('deduct_aura', {
      p_user_id: user.id,
      p_amount: Math.floor(amount),
      p_reason: reason
    });

    if (error) {
      console.error('Error deducting aura:', error);
      return NextResponse.json({ error: 'Failed to deduct aura' }, { status: 500 });
    }

    return NextResponse.json({ success: true, aura: newAura });
    
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
