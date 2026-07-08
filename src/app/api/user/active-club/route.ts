import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { getActiveClubId } from '@/lib/club';

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    
    // 유저 인증 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ club: null });
    }

    const clubId = await getActiveClubId();
    if (!clubId) {
      return NextResponse.json({ club: null });
    }

    const { data, error } = await supabase
      .from('clubs')
      .select('id, name, code')
      .eq('id', clubId)
      .single();

    if (error || !data) {
      return NextResponse.json({ club: null });
    }

    return NextResponse.json({ club: data });

  } catch (error) {
    console.error('Error fetching active club:', error);
    return NextResponse.json({ club: null }, { status: 500 });
  }
}
