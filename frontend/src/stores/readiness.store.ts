import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { fetchReadiness } from '../api/readiness';
import type { ReadinessReport, StudentReadiness } from '../types/readiness';

export const useReadinessStore = defineStore('readiness', () => {
  const report = ref<ReadinessReport | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * Seats that need attention first.
   *
   * During an exam an invigilator's attention is the scarce resource. A flat
   * roster makes them scan; ordering by what is wrong puts the seats that
   * cannot start at the top.
   */
  const needsAttention = computed<StudentReadiness[]>(() => {
    const students = report.value?.students ?? [];
    const rank = (s: StudentReadiness): number => {
      if (s.envCheckStatus === 'FAILED') return 0;
      if (!s.isRegistered) return 1;
      if (!s.isLoggedIn) return 2;
      if (!s.isOnline) return 3;
      if (s.envCheckStatus !== 'PASSED') return 4;
      return 5;
    };
    return [...students].sort((a, b) => rank(a) - rank(b) || a.testId.localeCompare(b.testId));
  });

  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      report.value = await fetchReadiness();
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message;
    } finally {
      loading.value = false;
    }
  }

  return { report, loading, error, needsAttention, refresh };
});
