import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export type ExamPhase =
  | 'UNINITIALIZED'
  | 'INITIALIZED'
  | 'SETUP_FINISHED'
  | 'IN_PROGRESS'
  | 'FINISHED';

export const useManageStore = defineStore('manage', () => {
  /* Defaults to the phase that grants nothing. Starting at anything else means
   * a console that has not yet heard from the backend would show the exam as
   * further along than it is. */
  const examState = ref<ExamPhase>('UNINITIALIZED');
  /** At most one entry; empty once the exam is over. */
  const allowedNext = ref<ExamPhase[]>([]);
  const missingPreconditions = ref<string[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchExamState() {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/exam-state`);
      examState.value = res.data.state || res.data;
      allowedNext.value = res.data.allowedNext ?? [];
    } catch (err: any) {
      error.value = err.response?.data?.error || err.response?.data?.message || err.message;
    } finally {
      loading.value = false;
    }
  }

  async function setExamState(state: ExamPhase) {
    loading.value = true;
    error.value = null;
    missingPreconditions.value = [];
    try {
      const res = await axios.post(`${BACKEND_URL}/admin/exam-state`, { state });
      examState.value = res.data.state || state;
      allowedNext.value = res.data.allowedNext ?? [];
    } catch (err: any) {
      const data = err.response?.data;
      /* The backend names what is still missing. Passing that through is the
       * difference between "cannot advance" and "cannot advance because there
       * is no roster yet". */
      if (data?.error === 'preconditions_not_met') {
        missingPreconditions.value = data.missing ?? [];
      }
      error.value = data?.error || data?.message || err.message;
    } finally {
      loading.value = false;
    }
  }

  /** Advance one phase. The order is not the operator's to choose. */
  async function advanceExamState() {
    const next = allowedNext.value[0];
    if (!next) return;
    await setExamState(next);
  }

  async function broadcastMessage(message: string) {
    loading.value = true;
    error.value = null;
    try {
      await axios.post(`${BACKEND_URL}/admin/messages`, { message });
    } catch (err: any) {
      error.value = err.response?.data?.error || err.response?.data?.message || err.message;
    } finally {
      loading.value = false;
    }
  }

  return {
    examState,
    allowedNext,
    missingPreconditions,
    loading,
    error,
    fetchExamState,
    setExamState,
    advanceExamState,
    broadcastMessage
  };
});
