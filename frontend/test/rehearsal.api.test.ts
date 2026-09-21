import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import {
  fetchLatestRehearsal, fetchRehearsalProfile, fetchRehearsalStatus, startRehearsal,
} from '../src/api/rehearsal';
import { descriptor, run } from './fixtures/rehearsal';

vi.mock('axios');
const mocked = vi.mocked(axios, true);

beforeEach(() => vi.restoreAllMocks());

describe('the rehearsal API module', () => {
  it('addresses the admin rehearsal endpoints', async () => {
    mocked.get.mockResolvedValue({ data: descriptor() });
    await fetchRehearsalProfile();
    expect(mocked.get).toHaveBeenCalledWith(expect.stringMatching(/\/admin\/rehearsal\/profile$/));

    mocked.get.mockResolvedValue({ data: { run: run() } });
    await fetchLatestRehearsal();
    expect(mocked.get).toHaveBeenCalledWith(expect.stringMatching(/\/admin\/rehearsal\/latest$/));
  });

  it('escapes the run id it is given', async () => {
    mocked.get.mockResolvedValue({ data: { run: null } });
    await fetchRehearsalStatus('a b/c');
    expect(mocked.get).toHaveBeenCalledWith(expect.stringContaining('a%20b%2Fc'));
  });

  it('always sends the wipe acknowledgement', async () => {
    mocked.post.mockResolvedValue({ data: { run: run() } });
    await startRehearsal();
    expect(mocked.post).toHaveBeenCalledWith(expect.any(String), { acknowledgeWipe: true });
  });
});
