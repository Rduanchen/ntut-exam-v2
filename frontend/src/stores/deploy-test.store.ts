import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchDeployTestProfile, fetchDeployTestStatus, fetchLatestDeployTest, startDeployTest } from '../api/deploy-test';
import { downloadJson } from '../utils/download-json';
import { isTerminalRun, type DeploymentTestProfile, type DeploymentTestRun, type ProfileDescriptor } from '../types/deploy-test';

const errorMessage = (error: unknown): string => {
  const shaped = error as { response?: { data?: { error?: string; reason?: string } }; message?: string };
  return shaped.response?.data?.reason ?? shaped.response?.data?.error ?? shaped.message ?? 'Unknown error';
};

const DRAFT_STORAGE_KEY = 'judger-deploy-test-profile-draft';

function storedDraft(profile: unknown, descriptor: ProfileDescriptor): DeploymentTestProfile | null {
  if (!profile || typeof profile !== 'object') return null;
  const candidate = profile as Partial<DeploymentTestProfile>;
  const phases = candidate.phases;
  const levels = candidate.concurrencyLevels;
  if (!Array.isArray(phases) || phases.length === 0 || new Set(phases).size !== phases.length || phases.some((phase) => !['smoke', 'verdict', 'concurrency'].includes(phase))) return null;
  if (!Array.isArray(levels) || levels.length === 0 || levels.length > descriptor.bounds.maxLevels || levels.some((level, index) => !Number.isInteger(level) || level < descriptor.bounds.minConcurrency || level > descriptor.bounds.maxConcurrency || (index > 0 && level <= levels[index - 1]))) return null;
  if (!Number.isInteger(candidate.jobCount) || candidate.jobCount! < descriptor.bounds.minJobs || candidate.jobCount! > descriptor.bounds.maxJobs) return null;
  if (!Number.isInteger(candidate.deadlineMs) || candidate.deadlineMs! < descriptor.bounds.minDeadlineMs || candidate.deadlineMs! > descriptor.bounds.maxDeadlineMs) return null;
  return {
    phases: phases as DeploymentTestProfile['phases'],
    languages: [...descriptor.defaults.languages],
    concurrencyLevels: levels,
    jobCount: candidate.jobCount!,
    deadlineMs: candidate.deadlineMs!,
  };
}

export const useDeployTestStore = defineStore('deploy-test', () => {
  const descriptor = ref<ProfileDescriptor | null>(null);
  const draft = ref<DeploymentTestProfile | null>(null);
  const run = ref<DeploymentTestRun | null>(null);
  const draining = ref(false);
  const profileLoading = ref(false);
  const latestLoading = ref(false);
  const starting = ref(false);
  const profileError = ref<string | null>(null);
  const runError = ref<string | null>(null);
  const stale = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  const active = computed(() => Boolean(run.value && !isTerminalRun(run.value)));
  const terminal = computed(() => Boolean(run.value && isTerminalRun(run.value)));
  const copyProfile = (profile: DeploymentTestProfile): DeploymentTestProfile => ({
    phases: [...profile.phases], languages: [...profile.languages],
    concurrencyLevels: [...profile.concurrencyLevels], jobCount: profile.jobCount, deadlineMs: profile.deadlineMs,
  });

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
      const envelope = await fetchDeployTestStatus(runId);
      if (currentGeneration !== generation) return;
      run.value = envelope.run;
      draining.value = envelope.draining;
      stale.value = false;
      runError.value = null;
      if (envelope.run && (!isTerminalRun(envelope.run) || envelope.draining)) schedule(runId, currentGeneration);
      else if (envelope.run) await loadProfile();
    } catch (error) {
      if (currentGeneration !== generation) return;
      stale.value = true;
      runError.value = errorMessage(error);
      schedule(runId, currentGeneration);
    }
  }

  function beginPolling(target: DeploymentTestRun): void {
    cancelPolling();
    if (isTerminalRun(target) && !draining.value) return;
    const currentGeneration = generation;
    schedule(target.id, currentGeneration);
  }

  async function loadProfile(): Promise<void> {
    profileLoading.value = true; profileError.value = null;
    try {
      descriptor.value = await fetchDeployTestProfile();
      if (!draft.value) {
        let restored: DeploymentTestProfile | null = null;
        try { restored = storedDraft(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? 'null'), descriptor.value); }
        catch { localStorage.removeItem(DRAFT_STORAGE_KEY); }
        draft.value = restored ?? copyProfile(descriptor.value.defaults);
      }
    }
    catch (error) { profileError.value = errorMessage(error); }
    finally { profileLoading.value = false; }
  }

  async function restoreLatest(): Promise<void> {
    latestLoading.value = true; runError.value = null;
    try {
      const envelope = await fetchLatestDeployTest();
      run.value = envelope.run; draining.value = envelope.draining; stale.value = false;
      if (envelope.run) beginPolling(envelope.run);
    } catch (error) { runError.value = errorMessage(error); }
    finally { latestLoading.value = false; }
  }

  async function loadAll(): Promise<void> { await Promise.allSettled([loadProfile(), restoreLatest()]); }

  async function start(): Promise<boolean> {
    if (!draft.value) return false;
    starting.value = true; runError.value = null;
    try {
      const envelope = await startDeployTest(copyProfile(draft.value));
      if (envelope.run) { run.value = envelope.run; draining.value = envelope.draining; stale.value = false; beginPolling(envelope.run); }
      return true;
    } catch (error) { runError.value = errorMessage(error); return false; }
    finally { starting.value = false; }
  }

  function saveDraft(): void {
    if (draft.value) localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft.value));
  }

  function exportReport(): void {
    if (!run.value || !isTerminalRun(run.value)) return;
    downloadJson(run.value, `judger-deploy-test-${run.value.id}.json`);
  }

  function teardown(): void { cancelPolling(); }

  return { descriptor, draft, run, draining, profileLoading, latestLoading, starting, profileError, runError, stale, active, terminal, loadProfile, restoreLatest, loadAll, start, saveDraft, exportReport, teardown };
});
