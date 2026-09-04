import axios from 'axios';
import { BACKEND_URL } from './backend-url';
import type {
  BackendHealth,
  JudgeSettingsResponse,
} from '../types/judge-settings';
import type { ExamConfig } from '../types/config';


/**
 * The two endpoints this page exists to make reachable, plus the exam
 * configuration it needs to know which languages the paper requires.
 *
 * A module rather than inline axios, so the page's behaviour is testable
 * without a live backend. Every scenario in the specification asserts something
 * like "the backend says a language is missing" — reachable directly here,
 * rather than by mocking HTTP inside a component and testing the mock.
 *
 * Authorisation rides on the shared client's interceptor; nothing is added.
 */

export async function fetchJudgeSettings(): Promise<JudgeSettingsResponse> {
  const res = await axios.get(`${BACKEND_URL}/admin/judger/settings`);
  return res.data;
}

/**
 * Apply a settings change.
 *
 * Returns what the backend reports, which is not necessarily what was sent:
 * an out-of-range value comes back clamped. The caller must display the
 * response, never the input.
 */
export async function updateJudgeSettings(
  changes: Record<string, number | string>,
): Promise<JudgeSettingsResponse> {
  const res = await axios.put(`${BACKEND_URL}/admin/judger/settings`, changes);
  return res.data;
}

export async function fetchBackendHealth(): Promise<BackendHealth> {
  const res = await axios.get(`${BACKEND_URL}/admin/judger/health`);
  return res.data;
}

export async function fetchExamConfig(): Promise<ExamConfig> {
  const res = await axios.get(`${BACKEND_URL}/admin/config`);
  return res.data;
}
