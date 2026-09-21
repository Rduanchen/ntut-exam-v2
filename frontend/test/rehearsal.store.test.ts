import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import axios from 'axios';

import { useRehearsalStore } from '../src/stores/rehearsal.store';
import { descriptor, run } from './fixtures/rehearsal';

vi.mock('axios');
const mocked = vi.mocked(axios, true);

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('the rehearsal store', () => {
  it('picks the last report back up on mount', async () => {
    mocked.get.mockImplementation(async (url: string) =>
      url.endsWith('/profile') ? { data: descriptor() } : { data: { run: run() } });

    const store = useRehearsalStore();
    await store.loadAll();

    expect(store.run?.id).toBe('run-1');
    expect(store.terminal).toBe(true);
    expect(store.active).toBe(false);
  });

  it('resumes polling a rehearsal that is still running', async () => {
    const running = run({ state: 'running', overallOutcome: undefined, finishedAt: undefined, cleanupCompleted: false, currentStage: 'submit' });
    mocked.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/profile')) return { data: descriptor({ canStart: false, blockedReason: 'rehearsal_active' }) };
      if (url.endsWith('/latest')) return { data: { run: running } };
      return { data: { run: run() } };
    });

    const store = useRehearsalStore();
    await store.loadAll();
    expect(store.active).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.run?.state).toBe('completed');
    expect(store.active).toBe(false);
  });

  it('keeps the last report on screen when a poll fails, and marks it stale', async () => {
    const running = run({ state: 'running', overallOutcome: undefined, finishedAt: undefined, cleanupCompleted: false });
    mocked.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/profile')) return { data: descriptor() };
      if (url.endsWith('/latest')) return { data: { run: running } };
      throw new Error('connection lost');
    });

    const store = useRehearsalStore();
    await store.loadAll();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(store.stale).toBe(true);
    expect(store.run?.id).toBe('run-1');
    expect(store.runError).toContain('connection lost');
  });

  it('surfaces the refusal reason when starting is not allowed', async () => {
    mocked.get.mockResolvedValue({ data: descriptor({ canStart: false, blockedReason: 'exam_data_present' }) });
    mocked.post.mockRejectedValue({ response: { data: { reason: 'exam_data_present' } } });

    const store = useRehearsalStore();
    await store.loadProfile();
    const started = await store.start();

    expect(started).toBe(false);
    expect(store.runError).toBe('exam_data_present');
    expect(store.run).toBeNull();
  });

  it('flags residue when a rehearsal could not clean up after itself', async () => {
    mocked.get.mockImplementation(async (url: string) =>
      url.endsWith('/profile')
        ? { data: descriptor({ canStart: false, blockedReason: 'cleanup_pending', pendingCleanup: true }) }
        : { data: { run: run({ overallOutcome: 'failed', cleanupCompleted: false, cleanupError: 'reset failed' }) } });

    const store = useRehearsalStore();
    await store.loadAll();

    expect(store.residueWarning).toBe(true);
  });

  it('stops polling on teardown', async () => {
    const running = run({ state: 'running', overallOutcome: undefined, finishedAt: undefined, cleanupCompleted: false });
    mocked.get.mockImplementation(async (url: string) =>
      url.endsWith('/profile') ? { data: descriptor() } : { data: { run: running } });

    const store = useRehearsalStore();
    await store.loadAll();
    store.teardown();
    mocked.get.mockClear();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocked.get).not.toHaveBeenCalled();
  });

  it('asks for the wipe acknowledgement the backend requires', async () => {
    mocked.get.mockResolvedValue({ data: descriptor() });
    mocked.post.mockResolvedValue({ data: { run: run({ state: 'queued', overallOutcome: undefined, finishedAt: undefined, cleanupCompleted: false }) } });

    const store = useRehearsalStore();
    await store.start();

    expect(mocked.post).toHaveBeenCalledWith(expect.stringContaining('/admin/rehearsal'), { acknowledgeWipe: true });
  });
});
