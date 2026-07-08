import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import type { Database } from '@/types/supabase';

type ServerSupabaseClient = ReturnType<typeof createServerClient<Database>>;
type AdminSupabaseClient = ReturnType<typeof createClient<Database>>;

const TABLES_WITH_CLUB_ID = [
  'match_schedules', 
  'generated_matches', 
  'attendances', 
  'team_assignments', 
  'match_coin_bets',
  'club_members' // club_members도 현재 클럽 내에서만 조회/수정되도록 제한
];

function withClubFilter(client: any, activeClubId: string | undefined | null) {
  if (!activeClubId) return client;

  const originalFrom = client.from.bind(client);

  client.from = (table: string) => {
    const qb = originalFrom(table);

    if (TABLES_WITH_CLUB_ID.includes(table)) {
      // 1. select, update, delete 체이닝 인터셉트
      const methodsToIntercept = ['select', 'update', 'delete'];
      methodsToIntercept.forEach(method => {
        if (typeof qb[method] === 'function') {
          const originalMethod = qb[method].bind(qb);
          qb[method] = (...args: any[]) => {
            const filterBuilder = originalMethod(...args);
            return filterBuilder.eq('club_id', activeClubId);
          };
        }
      });

      // 2. insert, upsert 페이로드 인터셉트
      ['insert', 'upsert'].forEach(method => {
        if (typeof qb[method] === 'function') {
          const originalMethod = qb[method].bind(qb);
          qb[method] = (data: any, ...args: any[]) => {
            let modifiedData = data;
            if (Array.isArray(data)) {
              modifiedData = data.map(d => ({ ...d, club_id: d.club_id || activeClubId }));
            } else if (data && typeof data === 'object') {
              modifiedData = { ...data, club_id: data.club_id || activeClubId };
            }
            return originalMethod(modifiedData, ...args);
          };
        }
      });
    }

    return qb;
  };

  return client;
}

export async function getSupabaseServerClient(): Promise<ServerSupabaseClient> {
  const cookieStore = await cookies();
  const activeClubId = cookieStore.get('active_club_id')?.value;

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components may not be able to write cookies.
          }
        },
      },
    }
  );

  let isApiOrAdmin = false;
  try {
    const headersList = await headers();
    const pathname = headersList.get('x-pathname') || '';
    if (pathname.startsWith('/admin') || pathname.startsWith('/admin-setup') || pathname.startsWith('/api/admin')) {
      isApiOrAdmin = true;
    }
  } catch (e) {
    // ignore
  }

  if (isApiOrAdmin) {
    return client;
  }

  return withClubFilter(client, activeClubId);
}

export async function getUnfilteredSupabaseServerClient(): Promise<ServerSupabaseClient> {
  const cookieStore = await cookies();
  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components may not be able to write cookies.
          }
        },
      },
    }
  );
  return client;
}

export function getSupabaseAdminClient(): AdminSupabaseClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
