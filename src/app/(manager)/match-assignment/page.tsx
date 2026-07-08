import { redirect } from 'next/navigation';

export default function MatchAssignmentRedirectPage() {
  redirect('/admin/players-today');
}
