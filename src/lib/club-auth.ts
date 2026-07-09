import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

function getDirectAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getClubRole(
  supabase: any,
  userId: string,
  clubId: string
): Promise<string | null> {
  const adminClient = getDirectAdminClient();
  const { data, error } = await adminClient
    .from('club_members')
    .select('role')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .single();

  if (error || !data) return null;
  return data.role;
}
