import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDeployTestStore } from '../src/stores/deploy-test.store';
import * as api from '../src/api/deploy-test';
import * as downloads from '../src/utils/download-json';
import { deployRun, descriptor, envelope } from './fixtures/deploy-test.fixture';

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); vi.restoreAllMocks(); vi.spyOn(api, 'fetchDeployTestProfile').mockResolvedValue(descriptor); vi.spyOn(api, 'fetchLatestDeployTest').mockResolvedValue(envelope()); });
describe('deploy test store', () => {
  it('loads profile and latest independently', async () => {
    vi.spyOn(api, 'fetchDeployTestProfile').mockRejectedValue(new Error('profile down'));
    const store = useDeployTestStore(); await store.loadAll();
    expect(store.profileError).toBe('profile down'); expect(store.run?.id).toBe('run-1');
  });
  it('starts explicitly and preserves authoritative refusal reasons', async () => {
    const start = vi.spyOn(api, 'startDeployTest').mockResolvedValue(envelope(deployRun({ state: 'queued', overallOutcome: undefined, finishedAt: undefined })));
    const store = useDeployTestStore(); await store.loadProfile(); expect(await store.start()).toBe(true); expect(start).toHaveBeenCalledWith(descriptor.defaults); store.teardown();
    start.mockRejectedValue({ response: { data: { reason: 'exam_in_progress' } } });
    expect(await store.start()).toBe(false); expect(store.runError).toBe('exam_in_progress');
  });
  it('exports the exact displayed terminal object and never uses localStorage as truth', async () => {
    const download = vi.spyOn(downloads, 'downloadJson').mockImplementation(() => undefined);
    const store = useDeployTestStore(); await store.restoreLatest(); store.exportReport();
    expect(download).toHaveBeenCalledWith(store.run, 'judger-deploy-test-run-1.json');
  });
  it('saves a valid profile draft locally and restores it without restoring run truth', async () => {
    const first = useDeployTestStore(); await first.loadProfile();
    first.draft = { ...descriptor.defaults, phases: ['smoke'], concurrencyLevels: [2, 6], jobCount: 37, deadlineMs: 120_000 };
    first.saveDraft();
    setActivePinia(createPinia());
    const restored = useDeployTestStore(); await restored.loadProfile();
    expect(restored.draft).toEqual(first.draft);
    expect(restored.run).toBeNull();
  });
  it('ignores malformed or out-of-bounds stored profile drafts', async () => {
    localStorage.setItem('judger-deploy-test-profile-draft', '{');
    const malformed = useDeployTestStore(); await malformed.loadProfile();
    expect(malformed.draft).toEqual(descriptor.defaults);
    expect(localStorage.getItem('judger-deploy-test-profile-draft')).toBeNull();

    setActivePinia(createPinia());
    localStorage.setItem('judger-deploy-test-profile-draft', JSON.stringify({ ...descriptor.defaults, jobCount: 999 }));
    const store = useDeployTestStore(); await store.loadProfile();
    expect(store.draft).toEqual(descriptor.defaults);
  });
  it('polls active work recursively, stops at terminal state, and records transient staleness', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'fetchLatestDeployTest').mockResolvedValue(envelope(deployRun({ state: 'running', overallOutcome: undefined, finishedAt: undefined })));
    const status = vi.spyOn(api, 'fetchDeployTestStatus')
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(envelope());
    const store = useDeployTestStore(); await store.loadProfile();
    store.draft = { ...descriptor.defaults, concurrencyLevels: [2, 6], jobCount: 37, deadlineMs: 120_000 };
    await store.restoreLatest();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.stale).toBe(true); expect(store.runError).toBe('temporary');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.stale).toBe(false); expect(store.terminal).toBe(true); expect(status).toHaveBeenCalledTimes(2);
    expect(store.draft).toMatchObject({ concurrencyLevels: [2, 6], jobCount: 37, deadlineMs: 120_000 });
    await vi.advanceTimersByTimeAsync(5_000); expect(status).toHaveBeenCalledTimes(2);
    store.teardown(); vi.useRealTimers();
  });
  it('keeps polling a frozen terminal report while work drains, then refreshes eligibility', async () => {
    vi.useFakeTimers();
    const interrupted = deployRun({ state: 'interrupted', overallOutcome: 'interrupted', interruptionReason: 'deadline_exceeded' });
    vi.spyOn(api, 'fetchLatestDeployTest').mockResolvedValue({ run: interrupted, draining: true });
    const status = vi.spyOn(api, 'fetchDeployTestStatus')
      .mockResolvedValueOnce({ run: interrupted, draining: true })
      .mockResolvedValueOnce({ run: interrupted, draining: false });
    const profile = vi.spyOn(api, 'fetchDeployTestProfile');
    const store = useDeployTestStore(); await store.restoreLatest();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(status).toHaveBeenCalledTimes(2);
    expect(store.draining).toBe(false);
    expect(profile).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(status).toHaveBeenCalledTimes(2);
    store.teardown(); vi.useRealTimers();
  });
  it('ignores late success and failure responses from an invalid polling generation', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'fetchLatestDeployTest').mockResolvedValue(envelope(deployRun({ state: 'running', overallOutcome: undefined, finishedAt: undefined })));
    let resolveStatus!: (value: ReturnType<typeof envelope>) => void;
    vi.spyOn(api, 'fetchDeployTestStatus').mockImplementation(() => new Promise((resolve) => { resolveStatus = resolve; }));
    const store = useDeployTestStore(); await store.restoreLatest();
    vi.advanceTimersByTime(1_000); store.teardown(); resolveStatus(envelope()); await Promise.resolve(); await Promise.resolve();
    expect(store.run?.state).toBe('running');

    let rejectStatus!: (reason: Error) => void;
    vi.spyOn(api, 'fetchDeployTestStatus').mockImplementation(() => new Promise((_resolve, reject) => { rejectStatus = reject; }));
    await store.restoreLatest(); vi.advanceTimersByTime(1_000); store.teardown(); rejectStatus(new Error('late')); await Promise.resolve(); await Promise.resolve();
    expect(store.runError).toBeNull(); vi.useRealTimers();
  });
  it('reports a latest-load error without discarding profile state', async () => {
    vi.spyOn(api, 'fetchLatestDeployTest').mockRejectedValue(new Error('latest down'));
    const store = useDeployTestStore(); await store.loadAll();
    expect(store.descriptor).toEqual(descriptor); expect(store.runError).toBe('latest down');
  });
});
