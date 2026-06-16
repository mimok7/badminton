import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { getUserRole } from '@/lib/auth';

async function requireAdminOrManager() {
  const supabase = await getSupabaseServerClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const userRole = await getUserRole(supabase, user);
  if (!userRole || !['admin', 'manager'].includes(userRole)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { adminSupabase };
}

export async function GET() {
  try {
    const adminContext = await requireAdminOrManager();

    if ('error' in adminContext) {
      return adminContext.error;
    }

    const { data, error } = await adminContext.adminSupabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ tournaments: [] });
      }

      return NextResponse.json(
        {
          error: 'Failed to fetch tournaments',
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ tournaments: data || [] });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected server error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const adminContext = await requireAdminOrManager();

    if ('error' in adminContext) {
      return adminContext.error;
    }

    const payload = await request.json().catch(() => null);
    const tournament = payload?.tournament;
    const matches = Array.isArray(payload?.matches) ? payload.matches : [];

    if (!tournament || typeof tournament !== 'object') {
      return NextResponse.json({ error: 'Invalid tournament payload' }, { status: 400 });
    }

    const tournamentToInsert = tournament as any;

    const { data: createdTournament, error: tournamentError } = await adminContext.adminSupabase
      .from('tournaments')
      .insert(tournamentToInsert)
      .select()
      .single();

    if (tournamentError) {
      return NextResponse.json(
        {
          error: 'Failed to create tournament',
          code: tournamentError.code,
          message: tournamentError.message,
          details: tournamentError.details,
          hint: tournamentError.hint,
        },
        { status: 500 }
      );
    }

    if (matches.length > 0) {
      const matchesToSave = matches.map((match: any) => ({
        ...(match as Record<string, unknown>),
        tournament_id: createdTournament.id,
      }));

      const { error: matchesError } = await adminContext.adminSupabase
        .from('tournament_matches')
        .insert(matchesToSave as any);

      if (matchesError) {
        return NextResponse.json(
          {
            error: 'Failed to save tournament matches',
            code: matchesError.code,
            message: matchesError.message,
            details: matchesError.details,
            hint: matchesError.hint,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, tournament: createdTournament });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected server error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
