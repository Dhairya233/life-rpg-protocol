import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('daily_luck_rolls')
      .select('luck_value, is_grind_day')
      .eq('user_id', user.id)
      .eq('roll_date', today)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('API Error: Check Luck', error);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    if (data) {
      return NextResponse.json({ success: true, rolled: true, luck_value: data.luck_value, is_grind_day: data.is_grind_day });
    } else {
      return NextResponse.json({ success: true, rolled: false });
    }
  } catch (error) {
    console.error('API Error: Check Luck Engine', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
