import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { DEFAULT_COIN_SETTINGS, type CoinSettings, type CoinSettlementMode } from '@/lib/coins';

const SETTINGS_DIR = path.join(process.cwd(), 'data');
const SETTINGS_PATH = path.join(SETTINGS_DIR, 'coin-settings.json');

function normalizeInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function normalizeMode(value: unknown): CoinSettlementMode {
  return value === 'winner_only_pool' || value === 'winner_only_fixed' || value === 'zero_sum'
    ? value
    : DEFAULT_COIN_SETTINGS.settlementMode;
}

function normalizeSettings(value: unknown): CoinSettings {
  const raw = typeof value === 'object' && value !== null ? (value as Partial<CoinSettings>) : {};

  return {
    initialCoinBalance: normalizeInteger(raw.initialCoinBalance, DEFAULT_COIN_SETTINGS.initialCoinBalance),
    settlementMode: normalizeMode(raw.settlementMode),
    fixedWinnerReward: normalizeInteger(raw.fixedWinnerReward, DEFAULT_COIN_SETTINGS.fixedWinnerReward),
    attendanceReward: normalizeInteger(raw.attendanceReward, DEFAULT_COIN_SETTINGS.attendanceReward),
    guestInitialCoin: normalizeInteger(raw.guestInitialCoin, DEFAULT_COIN_SETTINGS.guestInitialCoin),
    guestAttendanceReward: normalizeInteger(raw.guestAttendanceReward, DEFAULT_COIN_SETTINGS.guestAttendanceReward),
    isCoinEnabled: typeof raw.isCoinEnabled === 'boolean' ? raw.isCoinEnabled : DEFAULT_COIN_SETTINGS.isCoinEnabled,
  };
}

export async function readCoinSettings(): Promise<CoinSettings> {
  try {
    const content = await readFile(SETTINGS_PATH, 'utf8');
    return normalizeSettings(JSON.parse(content));
  } catch {
    return DEFAULT_COIN_SETTINGS;
  }
}

export async function writeCoinSettings(nextSettings: CoinSettings): Promise<CoinSettings> {
  const normalized = normalizeSettings(nextSettings);
  await mkdir(SETTINGS_DIR, { recursive: true });
  await writeFile(SETTINGS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}
