import axios from 'axios';
import { BACKEND_URL } from './backend-url';
import type { DeploymentTestProfile, ProfileDescriptor, RunEnvelope } from '../types/deploy-test';

const ROOT = `${BACKEND_URL}/admin/judger/deploy-tests`;

export async function fetchDeployTestProfile(): Promise<ProfileDescriptor> {
  return (await axios.get(`${ROOT}/profile`)).data;
}

export async function startDeployTest(profile: DeploymentTestProfile): Promise<RunEnvelope> {
  return (await axios.post(ROOT, profile)).data;
}

export async function fetchLatestDeployTest(): Promise<RunEnvelope> {
  return (await axios.get(`${ROOT}/latest`)).data;
}

export async function fetchDeployTestStatus(runId: string): Promise<RunEnvelope> {
  return (await axios.get(`${ROOT}/${encodeURIComponent(runId)}`)).data;
}
