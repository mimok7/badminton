export async function getClubRole(
  supabase: any,
  userId: string,
  clubId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('club_members')
    .select('role')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .single();

  if (error || !data) return null;
  return data.role;
}
