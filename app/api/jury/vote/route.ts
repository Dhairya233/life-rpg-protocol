// app/api/jury/vote/route.ts
// Secure API route for juror voting

import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    
    // 1. Verify Authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userQuestId, vote } = body;

    if (!userQuestId || typeof vote !== 'boolean') {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
    }

    // 2. Fetch Juror's Aura (Snapshot for weight)
    const { data: jurorProfile, error: profileError } = await supabase
      .from('profiles')
      .select('aura')
      .eq('id', user.id)
      .single();

    if (profileError || !jurorProfile) {
      return NextResponse.json({ error: 'Could not fetch juror profile' }, { status: 500 });
    }

    const currentAura = jurorProfile.aura;

    // 3. Verify the quest is actually pending and not owned by the juror
    const { data: targetQuest, error: targetError } = await supabase
      .from('user_quests')
      .select('user_id, status')
      .eq('id', userQuestId)
      .single();

    if (targetError || !targetQuest) {
      return NextResponse.json({ error: 'Quest submission not found' }, { status: 404 });
    }

    if (targetQuest.user_id === user.id) {
      return NextResponse.json({ error: 'You cannot vote on your own submission' }, { status: 403 });
    }

    if (targetQuest.status !== 'pending_verification') {
      return NextResponse.json({ error: 'This submission is no longer pending verification' }, { status: 400 });
    }

    // 4. Insert the Vote
    const { error: insertError } = await supabase
      .from('jury_votes')
      .insert({
        user_quest_id: userQuestId,
        juror_id: user.id,
        vote: vote,
        juror_aura_snapshot: currentAura
      });

    if (insertError) {
      // 23505 is PostgreSQL unique violation code
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'You have already voted on this submission' }, { status: 409 });
      }
      console.error('Error inserting vote:', insertError);
      return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
    }

    // 5. Trigger Verdict Resolution via RPC
    const { data: resolution, error: resolveError } = await supabase.rpc('resolve_verdict', {
      p_user_quest_id: userQuestId
    });

    if (resolveError) {
      console.error('Error resolving verdict:', resolveError);
      // We still return success for the vote itself, even if resolution failed
    }

    return NextResponse.json({ 
      success: true, 
      weight: currentAura,
      resolution: resolution || 'pending_votes'
    });
    
  } catch (error) {
    console.error('Jury API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
