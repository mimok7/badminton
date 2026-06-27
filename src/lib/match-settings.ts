import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const SETTINGS_DIR = path.join(process.cwd(), 'data');
const SETTINGS_PATH = path.join(SETTINGS_DIR, 'match-settings.json');

export type MatchSettings = {
  autoGenerateEnabled: boolean;
};

const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  autoGenerateEnabled: false,
};

export async function readMatchSettings(): Promise<MatchSettings> {
  try {
    const content = await readFile(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(content);
    return {
      autoGenerateEnabled: typeof parsed.autoGenerateEnabled === 'boolean' ? parsed.autoGenerateEnabled : false,
    };
  } catch {
    return DEFAULT_MATCH_SETTINGS;
  }
}

export async function writeMatchSettings(settings: MatchSettings): Promise<MatchSettings> {
  await mkdir(SETTINGS_DIR, { recursive: true });
  await writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return settings;
}
