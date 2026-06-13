// src/app/api/match-results/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import type { Database } from '@/types/supabase';

// POST: 경기 결과 저장
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { match_id, winner_team1, team1_score, team2_score } = await request.json();
  const normalizedMatchId = Number(match_id);
  const normalizedTeam1Score = Number(team1_score);
  const normalizedTeam2Score = Number(team2_score);

  // 간단한 입력 유효성 검사
  if (
    !Number.isFinite(normalizedMatchId) ||
    winner_team1 === undefined ||
    !Number.isFinite(normalizedTeam1Score) ||
    !Number.isFinite(normalizedTeam2Score)
  ) {
    return NextResponse.json({ error: 'Invalid input data' }, { status: 400 });
  }

  const payload: Database['public']['Tables']['match_results']['Insert'] = {
    match_id: normalizedMatchId,
    winner_team1: Boolean(winner_team1),
    team1_score: normalizedTeam1Score,
    team2_score: normalizedTeam2Score,
  };

  const matchResultsTable: any = (supabase as any).from('match_results');
  const { data, error } = await matchResultsTable.insert(payload);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

// GET: 특정 경기 결과 조회 (match_id로)
export async function GET(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { searchParams } = new URL(request.url);
  const match_id = searchParams.get('match_id');
  const normalizedMatchId = Number(match_id);

  if (!Number.isFinite(normalizedMatchId)) {
    return NextResponse.json({ error: 'Missing match_id' }, { status: 400 });
  }

  const matchResultsTable: any = (supabase as any).from('match_results');
  const { data, error } = await matchResultsTable
    .select('*')
    .eq('match_id', normalizedMatchId)
    .single(); // 단일 결과 조회

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
