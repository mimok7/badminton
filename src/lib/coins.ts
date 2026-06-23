export const INITIAL_COIN_BALANCE = 30;
export const DEFAULT_MATCH_WAGER = 1;
export const MAX_MATCH_WAGER = 3;

export type CoinSettlementMode = 'zero_sum' | 'winner_only_pool' | 'winner_only_fixed';

export type CoinSettings = {
  initialCoinBalance: number;
  settlementMode: CoinSettlementMode;
  fixedWinnerReward: number;
};

export const DEFAULT_COIN_SETTINGS: CoinSettings = {
  initialCoinBalance: INITIAL_COIN_BALANCE,
  settlementMode: 'zero_sum',
  fixedWinnerReward: 1,
};

export function formatCoinDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
