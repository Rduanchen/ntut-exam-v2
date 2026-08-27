/**
 * View-side types for the judge settings page.
 *
 * Mirrors what the backend reports (feature 004). Kept separate from the exam
 * configuration types because the page's concern is *effective* values and
 * where they came from, which the exam configuration does not express.
 */

/** Where a value in force came from. */
export type SettingOrigin = 'config' | 'env' | 'default' | 'clamped';

/**
 * The lifetime a setting belongs to.
 *
 * This is why the page is grouped at all: the three obey different rules, and
 * an operator who cannot tell them apart will lose work to a config upload.
 */
export type SettingGroup = 'exam' | 'machine' | 'container';

export interface EffectiveSetting {
  value: number | string;
  origin: SettingOrigin;
}

/** As reported by GET /admin/judger/settings. */
export interface JudgeSettingsResponse {
  settings: Record<string, EffectiveSetting>;
  activeCeiling: number;
}

export interface Runtime {
  language: string;
  version: string;
  aliases?: string[];
}

/** As reported by GET /admin/judger/health. */
export interface BackendHealth {
  reachable: boolean;
  url: string;
  runtimes: Runtime[];
  checkedAt: number;
  error?: string;
}

/** One language the exam paper needs, resolved against what the backend has. */
export interface LanguageRequirement {
  examLanguage: string;
  available: boolean;
  matchedRuntime?: Runtime;
}

/** Which settings belong to which group, and which are editable at all. */
export const SETTING_GROUPS: Record<string, SettingGroup> = {
  timeLimit: 'exam',
  memoryLimit: 'exam',
  compareMode: 'exam',
  compileTimeout: 'exam',
  compileMemoryLimit: 'exam',
  maxSystemRetries: 'exam',
  maxConcurrentJobs: 'machine',
};

/**
 * Settings that only take effect when the execution backend starts.
 *
 * Deliberately carry NO value. Nothing exposes them — they are container
 * environment variables read at startup — and showing the compose file's
 * defaults would be a confident wrong number for anyone who deployed with an
 * override. An honest gap beats a plausible lie.
 */
export const CONTAINER_SETTINGS: ReadonlyArray<{ key: string; governedBy: string }> = [
  { key: 'PISTON_MAX_CONCURRENT_JOBS', governedBy: 'docker-compose.yml' },
  { key: 'PISTON_OUTPUT_MAX_SIZE', governedBy: 'docker-compose.yml' },
  { key: 'privileged / tmpfs / resource limits', governedBy: 'docker-compose.yml' },
];
