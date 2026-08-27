import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { socket } from '../plugins/socket';
import { startJudging, waitForJudging, type JudgingJob } from '../api/judging';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export const useStudentStore = defineStore('student', () => {
  const students = ref<any[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Setup socket listener for real-time updates
  socket.on('data-update', (payload: any) => {
    if (payload && payload.type === 'student') {
      fetchStudents(true);
    }
  });

  async function fetchStudents(silent = false) {
    if (!silent) loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/device`);
      students.value = res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to fetch students';
    } finally {
      if (!silent) loading.value = false;
    }
  }

  async function resetDeviceBinding(testId: string) {
    loading.value = true;
    error.value = null;
    try {
      await axios.put(`${BACKEND_URL}/admin/users/${testId}/reset-device`);
      await fetchStudents();
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to reset device';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchStudentCode(testId: string) {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/submissions/${testId}/code`);
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to fetch student code';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Re-evaluate one student's submissions.
   *
   * The endpoint answers immediately with a handle rather than with results,
   * so this waits for the job to reach a terminal state before resolving. The
   * live-update channel announces completion too; polling is the fallback that
   * keeps a dropped notification from looking like lost work.
   */
  async function reevaluateStudentCode(testId: string): Promise<JudgingJob> {
    loading.value = true;
    error.value = null;
    try {
      const handle = await startJudging(testId);
      const job = await waitForJudging(handle.jobId);

      if (job.state === 'failed') {
        error.value = job.error || 'Judging failed';
      } else if (job.outcome && job.outcome.systemFailures > 0) {
        /* Surfaced rather than swallowed: these are the machine's failures, not
         * the student's, and an operator needs to know the machine is sick. */
        error.value =
          `${job.outcome.systemFailures} submission(s) could not be judged ` +
          `for system reasons and were not scored.`;
      }
      return job;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to re-evaluate student code';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function exportStudentCodeZip(testId: string) {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/submissions/${testId}/export`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${testId}_codes.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      error.value = 'Failed to export student code zip';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deleteStudentCode(testId: string, questionId?: string) {
    loading.value = true;
    error.value = null;
    try {
      const url = new URL(`${BACKEND_URL}/admin/submissions/${testId}/code`);
      if (questionId) {
        url.searchParams.append('questionId', questionId);
      }
      await axios.delete(url.toString());
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to delete student code';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    students,
    loading,
    error,
    fetchStudents,
    resetDeviceBinding,
    fetchStudentCode,
    reevaluateStudentCode,
    exportStudentCodeZip,
    deleteStudentCode
  };
});
