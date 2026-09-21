import axios from 'axios';
import { BACKEND_URL } from './backend-url';
import type { RehearsalDescriptor, RehearsalEnvelope } from '../types/rehearsal';

const ROOT = `${BACKEND_URL}/admin/rehearsal`;

export async function fetchRehearsalProfile(): Promise<RehearsalDescriptor> {
  return (await axios.get(`${ROOT}/profile`)).data;
}

/**
 * Start a rehearsal.
 *
 * `acknowledgeWipe` is not a formality the client can decide on its own — the
 * backend requires it literally, and the operator must have been told what it
 * means before this is called.
 */
export async function startRehearsal(): Promise<RehearsalEnvelope> {
  return (await axios.post(ROOT, { acknowledgeWipe: true })).data;
}

export async function fetchLatestRehearsal(): Promise<RehearsalEnvelope> {
  return (await axios.get(`${ROOT}/latest`)).data;
}

export async function fetchRehearsalStatus(runId: string): Promise<RehearsalEnvelope> {
  return (await axios.get(`${ROOT}/${encodeURIComponent(runId)}`)).data;
}
