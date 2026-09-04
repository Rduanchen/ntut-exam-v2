import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import * as settingsApi from '../src/api/judge-settings';
import * as judgingApi from '../src/api/judging';

vi.mock('axios');

/**
 * Exercises URL construction, which every other test in this suite skips.
 *
 * The rest of the suite mocks the api modules wholesale — good for testing the
 * page without a backend, but it means the modules' own code never runs. A
 * missing fallback for VITE_BACKEND_URL therefore shipped twice: every request
 * became the relative path "undefined/admin/...", the dev server answered with
 * index.html, and axios handed back an HTML string that is truthy. Nothing
 * threw at the fetch; the page broke later, mid-render, when something read a
 * field off it.
 *
 * Isolating at a boundary means nothing tests the boundary itself.
 */
const mocked = vi.mocked(axios, true);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.get.mockResolvedValue({ data: {} } as never);
  mocked.post.mockResolvedValue({ data: {} } as never);
  mocked.put.mockResolvedValue({ data: {} } as never);
});

const urlOf = (call: unknown[]) => String(call[0]);

describe('every request targets an absolute backend URL', () => {
  it('never emits a URL containing "undefined"', async () => {
    await settingsApi.fetchJudgeSettings();
    await settingsApi.fetchBackendHealth();
    await settingsApi.fetchExamConfig();
    await settingsApi.updateJudgeSettings({ maxConcurrentJobs: 4 });
    await judgingApi.startJudging('s-1');
    await judgingApi.startRejudge('s-1');
    await judgingApi.getJudgingJob('job-1');

    const urls = [
      ...mocked.get.mock.calls,
      ...mocked.post.mock.calls,
      ...mocked.put.mock.calls,
    ].map(urlOf);

    expect(urls.length).toBe(7);
    for (const url of urls) {
      expect(url, `"${url}" is not absolute`).toMatch(/^https?:\/\//);
      expect(url).not.toContain('undefined');
    }
  });

  it('addresses the endpoints the backend actually exposes', async () => {
    await settingsApi.fetchJudgeSettings();
    await settingsApi.fetchBackendHealth();

    const urls = mocked.get.mock.calls.map(urlOf);
    expect(urls[0]).toMatch(/\/admin\/judger\/settings$/);
    expect(urls[1]).toMatch(/\/admin\/judger\/health$/);
  });
});
