import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  fetchBackendHealth,
  fetchExamConfig,
  fetchJudgeSettings,
  updateJudgeSettings,
} from '../api/judge-settings';
import {
  SETTING_GROUPS,
  type BackendHealth,
  type EffectiveSetting,
  type LanguageRequirement,
  type Runtime,
  type SettingGroup,
} from '../types/judge-settings';
import type { ExamConfig } from '../types/config';

/**
 * Decide whether a runtime can run a language the exam asks for.
 *
 * The exam configuration says `Cpp`; the execution backend says `c++`. No
 * string transformation turns one into the other, so comparing names alone
 * reports C++ missing on every machine — a false alarm minutes before an exam,
 * which costs more than the check saves.
 *
 * The backend publishes aliases, and `c++` carries the alias `cpp`. Lowercasing
 * and matching name-or-alias therefore covers every supported language without
 * copying the backend's mapping table into a second place that nothing keeps in
 * step. It also keeps working if that mapping changes, because it derives from
 * what the backend REPORTS rather than from what this module BELIEVES.
 */
export function runtimeSatisfies(runtime: Runtime, examLanguage: string): boolean {
  const wanted = examLanguage.trim().toLowerCase();
  if (runtime.language.toLowerCase() === wanted) return true;
  return (runtime.aliases ?? []).some((alias) => alias.toLowerCase() === wanted);
}

/** Every language the paper depends on, resolved against what is installed. */
export function resolveLanguageRequirements(
  config: ExamConfig | null,
  runtimes: Runtime[],
): LanguageRequirement[] {
  if (!config) return [];

  const wanted = new Set<string>();
  for (const section of config.sections ?? []) {
    for (const puzzle of section.puzzles ?? []) {
      if (puzzle.language) wanted.add(puzzle.language);
    }
  }

  return [...wanted].sort().map((examLanguage) => {
    const matchedRuntime = runtimes.find((r) => runtimeSatisfies(r, examLanguage));
    // Unmatched is reported MISSING, never quietly omitted: a false "missing"
    // is visible and correctable, a false "present" is found during the exam.
    return { examLanguage, available: Boolean(matchedRuntime), matchedRuntime };
  });
}

export const useJudgeSettingsStore = defineStore('judge-settings', () => {
  const settings = ref<Record<string, EffectiveSetting> | null>(null);
  const activeCeiling = ref<number | null>(null);
  const health = ref<BackendHealth | null>(null);
  const examConfig = ref<ExamConfig | null>(null);

  const settingsError = ref<string | null>(null);
  const healthError = ref<string | null>(null);
  const settingsLoading = ref(false);
  const healthLoading = ref(false);
  const saving = ref(false);
  const saveError = ref<string | null>(null);

  /** Unsaved edits, kept strictly apart from the values in force. */
  const drafts = ref<Record<string, number | string>>({});

  const message = (err: unknown): string =>
    (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data
      ?.error ??
    (err as { message?: string })?.message ??
    'Unknown error';

  async function loadSettings() {
    settingsLoading.value = true;
    settingsError.value = null;
    try {
      const res = await fetchJudgeSettings();
      settings.value = res.settings;
      activeCeiling.value = res.activeCeiling;
    } catch (err) {
      /* Clear the values rather than keep the last known ones. Stale numbers
       * presented as current mislead an operator at the exact moment they are
       * deciding whether to change something. */
      settings.value = null;
      activeCeiling.value = null;
      settingsError.value = message(err);
    } finally {
      settingsLoading.value = false;
    }
  }

  async function loadHealth() {
    healthLoading.value = true;
    healthError.value = null;
    try {
      health.value = await fetchBackendHealth();
    } catch (err) {
      health.value = null;
      healthError.value = message(err);
    } finally {
      healthLoading.value = false;
    }
  }

  async function loadExamConfig() {
    try {
      examConfig.value = await fetchExamConfig();
    } catch {
      // The language check becomes unavailable; the rest of the page does not.
      examConfig.value = null;
    }
  }

  /** Settings and health load independently: neither failure disables the other. */
  async function loadAll() {
    await Promise.allSettled([loadSettings(), loadHealth(), loadExamConfig()]);
  }

  function setDraft(key: string, value: number | string) {
    drafts.value = { ...drafts.value, [key]: value };
  }

  function discardDrafts() {
    drafts.value = {};
  }

  const isDirty = computed(() => Object.keys(drafts.value).length > 0);

  function draftDiffers(key: string): boolean {
    if (!(key in drafts.value)) return false;
    return String(drafts.value[key]) !== String(settings.value?.[key]?.value);
  }

  /**
   * Apply drafts.
   *
   * Refreshes from the backend's response rather than echoing the input: a
   * value outside the permitted range comes back clamped, and showing what was
   * typed would claim it had been accepted.
   */
  async function save() {
    saving.value = true;
    saveError.value = null;
    try {
      const res = await updateJudgeSettings({ ...drafts.value });
      settings.value = res.settings;
      activeCeiling.value = res.activeCeiling;
      drafts.value = {};
      return true;
    } catch (err) {
      // The draft stays a draft. It must not be promoted into the value in force.
      saveError.value = message(err);
      return false;
    } finally {
      saving.value = false;
    }
  }

  const languageRequirements = computed(() =>
    resolveLanguageRequirements(examConfig.value, health.value?.runtimes ?? []),
  );

  const missingLanguages = computed(() =>
    languageRequirements.value.filter((r) => !r.available),
  );

  /** Settings belonging to one group, in a stable order. */
  function group(name: SettingGroup): Array<[string, EffectiveSetting]> {
    if (!settings.value) return [];
    return Object.entries(settings.value)
      .filter(([key]) => SETTING_GROUPS[key] === name)
      .sort(([a], [b]) => a.localeCompare(b));
  }

  /** Settings the backend reports that this page has no group for (FR-016). */
  const unknownSettings = computed<Array<[string, EffectiveSetting]>>(() =>
    settings.value
      ? Object.entries(settings.value).filter(([key]) => !(key in SETTING_GROUPS))
      : [],
  );

  return {
    settings, activeCeiling, health, examConfig,
    settingsError, healthError, settingsLoading, healthLoading,
    saving, saveError, drafts, isDirty,
    loadSettings, loadHealth, loadExamConfig, loadAll,
    setDraft, discardDrafts, draftDiffers, save,
    languageRequirements, missingLanguages, group, unknownSettings,
  };
});
