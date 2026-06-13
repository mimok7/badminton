import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-server';

const supabaseAdmin = getSupabaseAdminClient();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fullName = searchParams.get('fullName')?.trim();

  if (!fullName) {
    return NextResponse.json(
      { error: 'fullName is required' },
      { status: 400 }
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Supabase server configuration is missing' },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email, username, user_id')
    .eq('full_name', fullName)
    .limit(2);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to look up profile email' },
      { status: 500 }
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: 'No profile found for the provided full name' },
      { status: 404 }
    );
  }

  if (data.length > 1) {
    return NextResponse.json(
      { error: 'Multiple profiles found for the provided full name' },
      { status: 409 }
    );
  }

  const profile = data[0];
  let resolvedEmail = profile.email ?? '';

  if (!resolvedEmail && profile.user_id) {
    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);

    if (!authUserError) {
      resolvedEmail = authUserData.user?.email ?? '';
    }
  }

  return NextResponse.json({
    fullName: profile.full_name,
    email: resolvedEmail,
    username: profile.username ?? '',
    hasLinkedUser: Boolean(profile.user_id),
  });
}
