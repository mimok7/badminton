export const INITIAL_COIN_BALANCE = 30;
export const DEFAULT_MATCH_WAGER = 1;
export const MAX_MATCH_WAGER = 3;

export function formatCoinDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
