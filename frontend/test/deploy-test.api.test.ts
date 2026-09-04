import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { fetchDeployTestProfile, fetchDeployTestStatus, fetchLatestDeployTest, startDeployTest } from '../src/api/deploy-test';
import { descriptor } from './fixtures/deploy-test.fixture';

vi.mock('axios');
const mocked = vi.mocked(axios, true);
beforeEach(() => { vi.clearAllMocks(); mocked.get.mockResolvedValue({ data: {} } as never); mocked.post.mockResolvedValue({ data: {} } as never); });
describe('deploy-test HTTP boundary', () => {
  it('uses exact methods, absolute URLs, encoded ids, and an unchanged body', async () => {
    await fetchDeployTestProfile(); await fetchLatestDeployTest(); await fetchDeployTestStatus('run / 1'); await startDeployTest(descriptor.defaults);
    expect(mocked.get.mock.calls.map((call) => call[0])).toEqual([
      'http://localhost:3000/admin/judger/deploy-tests/profile',
      'http://localhost:3000/admin/judger/deploy-tests/latest',
      'http://localhost:3000/admin/judger/deploy-tests/run%20%2F%201',
    ]);
    expect(mocked.post).toHaveBeenCalledWith('http://localhost:3000/admin/judger/deploy-tests', descriptor.defaults);
  });
});
