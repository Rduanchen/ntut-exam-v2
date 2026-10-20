import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchLatestRehearsal, fetchRehearsalProfile, fetchRehearsalStatus, startRehearsal } from '../api/rehearsal';
import { isTerminalRehearsal, type RehearsalDescriptor, type RehearsalRun } from '../types/rehearsal';

const errorMessage = (error: unknown): string => {
  const shaped = error as { response?: { data?: { error?: string; reason?: string } }; message?: string };
  return shaped.response?.data?.reason ?? shaped.response?.data?.error ?? shaped.message ?? '未知錯誤';
};

export const useRehearsalStore = defineStore('rehearsal', () => {
  const descriptor = ref<RehearsalDescriptor | null>(null);
  const run = ref<RehearsalRun | null>(null);
  const profileError = ref<string | null>(null);
  const runError = ref<string | null>(null);
  const starting = ref(false);
  const stale = ref(false);

  let timer: ReturnType<typeof setTimeout> | undefined;
  /* Bumped on every cancel so a poll already in flight cannot write its result
   * over a newer one. */
  let generation = 0;

  const active = computed(() => Boolean(run.value && !isTerminalRehearsal(run.value)));
  const terminal = computed(() => Boolean(run.value && isTerminalRehearsal(run.value)));

  /** The machine is dirty and the operator has to know before the real exam. */
  const residueWarning = computed(() =>
    Boolean(run.value && isTerminalRehearsal(run.value) && !run.value.cleanupCompleted));

  function cancelPolling(): void {
    generation += 1;
    if (timer) clearTimeout(timer);
    timer = undefined;
  }

  function schedule(runId: string, currentGeneration: number): void {
    if (currentGeneration !== generation) return;
    timer = setTimeout(() => { void poll(runId, currentGeneration); }, 1_000);
  }

  async function poll(runId: string, currentGeneration: number): Promise<void> {
    try {
      const envelope = await fetchRehearsalStatus(runId);
      if (currentGeneration !== generation) return;
      run.value = envelope.run;
      stale.value = false;
      runError.value = null;
      if (envelope.run && !isTerminalRehearsal(envelope.run)) schedule(runId, currentGeneration);
      else await loadProfile();
    } catch (error) {
      if (currentGeneration !== generation) return;
      /* A failed poll is a lost connection, not a failed rehearsal. Keep the
       * last known report on screen, mark it stale, and keep trying. */
      stale.value = true;
      runError.value = errorMessage(error);
      schedule(runId, currentGeneration);
    }
  }

  function beginPolling(target: RehearsalRun): void {
    cancelPolling();
    if (isTerminalRehearsal(target)) return;
    schedule(target.id, generation);
  }

  async function loadProfile(): Promise<void> {
    profileError.value = null;
    try { descriptor.value = await fetchRehearsalProfile(); }
    catch (error) { profileError.value = errorMessage(error); }
  }

  /**
   * Pick the report back up.
   *
   * Called on mount, so a reload during a rehearsal resumes the progress view
   * and a visit long afterwards shows the last report — which outlives the
   * cleanup it describes.
   */
  async function restoreLatest(): Promise<void> {
    runError.value = null;
    try {
      const envelope = await fetchLatestRehearsal();
      run.value = envelope.run;
      stale.value = false;
      if (envelope.run) beginPolling(envelope.run);
    } catch (error) { runError.value = errorMessage(error); }
  }

  async function loadAll(): Promise<void> {
    await Promise.allSettled([loadProfile(), restoreLatest()]);
  }

  async function start(): Promise<boolean> {
    starting.value = true;
    runError.value = null;
    try {
      const envelope = await startRehearsal();
      if (envelope.run) { run.value = envelope.run; stale.value = false; beginPolling(envelope.run); }
      await loadProfile();
      return true;
    } catch (error) {
      runError.value = errorMessage(error);
      await loadProfile();
      return false;
    } finally { starting.value = false; }
  }

  function teardown(): void { cancelPolling(); }

  return {
    descriptor, run, profileError, runError, starting, stale,
    active, terminal, residueWarning,
    loadProfile, restoreLatest, loadAll, start, teardown,
  };
});
