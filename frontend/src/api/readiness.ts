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
