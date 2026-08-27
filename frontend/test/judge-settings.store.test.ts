import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useJudgeSettingsStore } from '../src/stores/judge-settings.store';
import * as api from '../src/api/judge-settings';
import { C_ONLY_RUNTIMES, FULL_RUNTIMES, examRequiring, reachable, unreachable } from './fixtures/judge.fixture';
import type { EffectiveSetting } from '../src/types/judge-settings';

const settingsResponse = (settings: Record<string, EffectiveSetting>, ceiling = 4) => ({
  settings,
  activeCeiling: ceiling,
});

const DEFAULT_SETTINGS: Record<string, EffectiveSetting> = {
  compileTimeout: { value: 30000, origin: 'default' },
  maxConcurrentJobs: { value: 4, origin: 'config' },
  maxSystemRetries: { value: 2, origin: 'env' },
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe('US1 - backend health', () => {
  it('reports reachability and installed runtimes', async () => {
    vi.spyOn(api, 'fetchBackendHealth').mockResolvedValue(reachable(FULL_RUNTIMES));
    const store = useJudgeSettingsStore();

    await store.loadHealth();

    expect(store.health?.reachable).toBe(true);
    expect(store.health?.runtimes).toHaveLength(5);
    // "reachable" without a timestamp is a claim about an unknown moment.
    expect(store.health?.checkedAt).toBeTypeOf('number');
  });

  it('treats an unreachable backend as a reported state, not a thrown failure', async () => {
    vi.spyOn(api, 'fetchBackendHealth').mockResolvedValue(unreachable());
    const store = useJudgeSettingsStore();

    await store.loadHealth();

    expect(store.health?.reachable).toBe(false);
    expect(store.healthError).toBeNull();
  });

  it('surfaces missing languages for the current exam', async () => {
    vi.spyOn(api, 'fetchBackendHealth').mockResolvedValue(reachable(C_ONLY_RUNTIMES));
    vi.spyOn(api, 'fetchExamConfig').mockResolvedValue(examRequiring('Python', 'Cpp'));
    const store = useJudgeSettingsStore();

    await store.loadHealth();
    await store.loadExamConfig();

    expect(store.missingLanguages.map((r) => r.examLanguage)).toEqual(['Python']);
  });

  it('re-checking replaces the previous result', async () => {
    const spy = vi
      .spyOn(api, 'fetchBackendHealth')
      .mockResolvedValueOnce(unreachable())
      .mockResolvedValueOnce(reachable(FULL_RUNTIMES));
    const store = useJudgeSettingsStore();

    await store.loadHealth();
    expect(store.health?.reachable).toBe(false);

    await store.loadHealth();
    expect(store.health?.reachable).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('US2 - provenance', () => {
  it('keeps the origin of every value', async () => {
    vi.spyOn(api, 'fetchJudgeSettings').mockResolvedValue(settingsResponse(DEFAULT_SETTINGS));
    const store = useJudgeSettingsStore();

    await store.loadSettings();

    expect(store.settings?.compileTimeout.origin).toBe('default');
    expect(store.settings?.maxConcurrentJobs.origin).toBe('config');
    expect(store.settings?.maxSystemRetries.origin).toBe('env');
  });

  it('groups settings by lifetime', async () => {
    vi.spyOn(api, 'fetchJudgeSettings').mockResolvedValue(settingsResponse(DEFAULT_SETTINGS));
    const store = useJudgeSettingsStore();
    await store.loadSettings();

    expect(store.group('exam').map(([k]) => k)).toEqual(['compileTimeout', 'maxSystemRetries']);
    expect(store.group('machine').map(([k]) => k)).toEqual(['maxConcurrentJobs']);
  });

  it('does not let an unrecognised setting break the page', async () => {
    vi.spyOn(api, 'fetchJudgeSettings').mockResolvedValue(
      settingsResponse({
        ...DEFAULT_SETTINGS,
        somethingNew: { value: 1, origin: 'wat' as never },
      }),
    );
    const store = useJudgeSettingsStore();

    await store.loadSettings();

    expect(store.unknownSettings.map(([k]) => k)).toEqual(['somethingNew']);
    expect(store.group('exam')).toHaveLength(2); // the rest still works
  });
});

describe('US3 - drafts and saving', () => {
  it('keeps an unsaved edit separate from the value in force', async () => {
    vi.spyOn(api, 'fetchJudgeSettings').mockResolvedValue(settingsResponse(DEFAULT_SETTINGS));
    const store = useJudgeSettingsStore();
    await store.loadSettings();

    store.setDraft('maxConcurrentJobs', 9);

    expect(store.isDirty).toBe(true);
    expect(store.draftDiffers('maxConcurrentJobs')).toBe(true);
    // Nothing applied.
    expect(store.settings?.maxConcurrentJobs.value).toBe(4);
  });

  it('shows the applied value after a save, not the typed one', async () => {
    // They differ exactly when it matters: an out-of-range value comes back
    // clamped, and echoing the input would claim it had been accepted.
    vi.spyOn(api, 'fetchJudgeSettings').mockResolvedValue(settingsResponse(DEFAULT_SETTINGS));
    vi.spyOn(api, 'updateJudgeSettings').mockResolvedValue(
      settingsResponse({ ...DEFAULT_SETTINGS, maxConcurrentJobs: { value: 64, origin: 'clamped' } }, 64),
    );
    const store = useJudgeSettingsStore();
    await store.loadSettings();

    store.setDraft('maxConcurrentJobs', 100000);
    const ok = await store.save();

    expect(ok).toBe(true);
    expect(store.settings?.maxConcurrentJobs.value).toBe(64);
    expect(store.settings?.maxConcurrentJobs.origin).toBe('clamped');
    expect(store.isDirty).toBe(false);
  });

  it('leaves a failed save as a draft, never as the value in force', async () => {
    vi.spyOn(api, 'fetchJudgeSettings').mockResolvedValue(settingsResponse(DEFAULT_SETTINGS));
    vi.spyOn(api, 'updateJudgeSettings').mockRejectedValue(new Error('backend down'));
    const store = useJudgeSettingsStore();
    await store.loadSettings();

    store.setDraft('maxConcurrentJobs', 9);
    const ok = await store.save();

    expect(ok).toBe(false);
    expect(store.saveError).toContain('backend down');
    expect(store.settings?.maxConcurrentJobs.value).toBe(4); // unchanged
    expect(store.isDirty).toBe(true); // still a draft
  });
});

describe('failure containment', () => {
  it('a settings failure leaves health usable', async () => {
    vi.spyOn(api, 'fetchJudgeSettings').mockRejectedValue(new Error('settings gone'));
    vi.spyOn(api, 'fetchBackendHealth').mockResolvedValue(reachable(FULL_RUNTIMES));
    vi.spyOn(api, 'fetchExamConfig').mockResolvedValue(examRequiring('C'));
    const store = useJudgeSettingsStore();

    await store.loadAll();

    expect(store.settingsError).toContain('settings gone');
    expect(store.health?.reachable).toBe(true);
  });

  it('a health failure leaves settings usable', async () => {
    vi.spyOn(api, 'fetchJudgeSettings').mockResolvedValue(settingsResponse(DEFAULT_SETTINGS));
    vi.spyOn(api, 'fetchBackendHealth').mockRejectedValue(new Error('health gone'));
    vi.spyOn(api, 'fetchExamConfig').mockResolvedValue(examRequiring('C'));
    const store = useJudgeSettingsStore();

    await store.loadAll();

    expect(store.healthError).toContain('health gone');
    expect(store.settings?.compileTimeout.value).toBe(30000);
  });

  it('a FAILED REFRESH clears the values rather than leaving stale ones', async () => {
    /* Tested on the refresh, not the initial load. Values left on screen after
     * a failed refresh tell an operator something false at the exact moment
     * they are deciding whether to change them. */
    const spy = vi
      .spyOn(api, 'fetchJudgeSettings')
      .mockResolvedValueOnce(settingsResponse(DEFAULT_SETTINGS))
      .mockRejectedValueOnce(new Error('gone'));
    const store = useJudgeSettingsStore();

    await store.loadSettings();
    expect(store.settings).not.toBeNull();

    await store.loadSettings();

    expect(store.settings).toBeNull();
    expect(store.settingsError).toContain('gone');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
