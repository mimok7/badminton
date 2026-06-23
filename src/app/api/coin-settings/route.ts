import { NextResponse } from 'next/server';
import { readCoinSettings } from '@/lib/coin-settings';

export async function GET() {
  const coinSettings = await readCoinSettings();

  return NextResponse.json({
    coinSettings,
  });
}
