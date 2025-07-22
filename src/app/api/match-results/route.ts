// src/app/api/match-results/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// POST: 경기 결과 저장
export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { match_id, winner_team1, team1_score, team2_score } = await request.json();

  // 간단한 입력 유효성 검사
  if (!match_id || winner_team1 === undefined || team1_score === undefined || team2_score === undefined) {
    return NextResponse.json({ error: 'Invalid input data' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('match_results')
    .insert([{ match_id, winner_team1, team1_score, team2_score }]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

// GET: 특정 경기 결과 조회 (match_id로)
export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(request.url);
  const match_id = searchParams.get('match_id');

  if (!match_id) {
    return NextResponse.json({ error: 'Missing match_id' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('match_results')
    .select('*')
    .eq('match_id', match_id)
    .single(); // 단일 결과 조회

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
