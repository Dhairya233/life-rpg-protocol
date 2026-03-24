import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    
    // Verify auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing image payload' }, { status: 400 });
    }

    // 1. Enforce strict Daily Rate Limiting
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const { data: existingLogs, error: fetchError } = await supabase
      .from('daily_discoveries')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', startOfDay.toISOString())
      .limit(1);

    if (fetchError) {
      console.error('Error fetching discovery rate limits:', fetchError);
      return NextResponse.json({ error: 'Database verification failed' }, { status: 500 });
    }

    if (existingLogs && existingLogs.length > 0) {
      return NextResponse.json({ error: 'Daily Discovery limit reached' }, { status: 429 });
    }

    // 2. Simulated AI Vision Analysis
    // We mock the AI latency to simulate the processing stage.
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const mockFeedbacks = [
      "A peaceful offline moment, perfect for restoring mental bandwidth.",
      "Nutritious and vibrant. Excellent physical fuel for high focus.",
      "Quality active recovery detected. Resting builds true resilience.",
      "A serene setting carefully cultivated to clear the mind."
    ];
    const analysis_summary = mockFeedbacks[Math.floor(Math.random() * mockFeedbacks.length)];
    const luck_granted = 10;

    // 3. Database State Update
    const { error: insertError } = await supabase
      .from('daily_discoveries')
      .insert({
        user_id: user.id,
        image_url: imageUrl,
        analysis_summary,
        luck_granted
      });

    if (insertError) {
      console.error('Error logging discovery:', insertError);
      return NextResponse.json({ error: 'Failed to log discovery' }, { status: 500 });
    }

    // 4. Secure RPC call to grant temporary luck safely
    const { error: rpcError } = await supabase.rpc('grant_temporary_luck', {
      p_user_id: user.id,
      p_luck_amount: luck_granted
    });

    if (rpcError) {
      console.error('Error granting luck:', rpcError);
      return NextResponse.json({ error: 'Failed to boost luck' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { analysis_summary, luck_granted }
    });

  } catch (err) {
    console.error('Discovery API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
