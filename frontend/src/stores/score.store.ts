import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { socket } from '../plugins/socket';
import { startRejudge, waitForJudging } from '../api/judging';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export const useScoreStore = defineStore('score', () => {
  const submissions = ref<any[]>([]);
  const scores = ref<any[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Setup socket listener for real-time score updates
  socket.on('score-update', () => {
    fetchSubmissions();
    fetchScores(true);
  });

  socket.on('data-update', (payload: any) => {
    if (payload && payload.type === 'score') {
      fetchSubmissions();
      fetchScores(true);
    }
  });

  async function fetchSubmissions() {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/submissions`);
      submissions.value = res.data.submissions || res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to fetch submissions';
    } finally {
      loading.value = false;
    }
  }

  /**
   * Re-judge a student.
   *
   * Until now this posted to a route the backend never mounted. The 404 was
   * caught below and written into `error`, which also skipped the refresh — so
   * pressing the button did nothing at all, silently.
   */
  async function rejudge(testId?: string) {
    loading.value = true;
    error.value = null;
    try {
      const handle = await startRejudge(testId);
      const job = await waitForJudging(handle.jobId);

      if (job.state === 'failed') {
        error.value = job.error || 'Rejudge failed';
      } else if (job.outcome && job.outcome.systemFailures > 0) {
        error.value =
          `${job.outcome.systemFailures} submission(s) could not be judged ` +
          `for system reasons and were not scored.`;
      }

      await fetchSubmissions();
      await fetchScores(true);
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to trigger rejudge';
    } finally {
      loading.value = false;
    }
  }

  async function fetchScores(silent = false) {
    if (!silent) loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/scores`);
      scores.value = res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to fetch scores';
    } finally {
      if (!silent) loading.value = false;
    }
  }

  return {
    submissions,
    scores,
    loading,
    error,
    fetchSubmissions,
    fetchScores,
    rejudge
  };
});
