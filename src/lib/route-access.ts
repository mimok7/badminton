export const AUTH_ROUTE_PREFIXES = ['/login', '/signup'] as const;

export const ADMIN_ROUTE_PREFIXES = [
  '/admin',
  '/admin-setup',
  '/attendance-all-test',
  '/database-test',
  '/match-assignment',
  '/match-registration',
  '/match-results',
  '/match-schedule',
  '/players',
  '/recurring-matches',
  '/team-management',
  '/test-attendance-all',
  '/today-matches',
] as const;

export const DEFAULT_USER_REDIRECT = '/dashboard';
export const DEFAULT_ADMIN_REDIRECT = '/admin';

export function matchesRoutePrefix(
  pathname: string,
  prefixes: readonly string[]
) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isSafeRedirectPath(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  return pathname.startsWith('/') && !pathname.startsWith('//');
}
