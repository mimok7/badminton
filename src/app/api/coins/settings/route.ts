import { NextResponse } from 'next/server';
import { readCoinSettings } from '@/lib/coin-settings';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const serverSupabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const coinSettings = await readCoinSettings();
    return NextResponse.json({
      isCoinEnabled: coinSettings.isCoinEnabled,
    });
  } catch (error) {
    console.error('Failed to load coin settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
