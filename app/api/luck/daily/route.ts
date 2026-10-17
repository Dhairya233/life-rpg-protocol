import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    
    // Auth Validation
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call securely isolated DB function
    const { data, error } = await supabase.rpc('roll_daily_luck', {
      p_user_id: user.id
    });

    if (error) {
      console.error('Error invoking luck sequence algorithm:', error);
      return NextResponse.json({ error: 'Failed to evaluate sequence' }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...data });
    
  } catch (error) {
    console.error('API Error: Inverse Luck Engine', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
