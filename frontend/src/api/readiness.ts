import axios from 'axios';
import { BACKEND_URL } from './backend-url';
import type { ReadinessReport } from '../types/readiness';

/**
 * Whether the room is ready to start.
 *
 * A module rather than inline axios so the page can be tested without a live
 * backend — every scenario worth asserting is "the backend says this seat is
 * not ready because X", which is reachable here directly.
 */
export async function fetchReadiness(): Promise<ReadinessReport> {
  const res = await axios.get<ReadinessReport>(`${BACKEND_URL}/admin/readiness`);
  return res.data;
}

/**
 * The paper as a file, for machines that cannot reach this backend.
 *
 * Carries the same halves the delivery endpoint sends — never the key and
 * never the password, so a lost memory stick is not a leaked exam.
 */
export async function fetchOfflineBundle(): Promise<unknown> {
  const res = await axios.get(`${BACKEND_URL}/admin/config/offline-bundle`);
  return res.data;
}
