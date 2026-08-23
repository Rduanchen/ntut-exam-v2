import { describe, it, expect } from 'vitest';

/**
 * `LOAD_TEST_MODE` disables the entire student cryptographic authentication
 * path (`user-crypto.middleware.ts:17-28`) and lets IPs be spoofed via headers.
 *
 * If a test ever enables it, the suite would report green while covering none
 * of the security surface it claims to cover. This guard makes that impossible
 * to do silently. See research R2.
 */
describe('Security guard: crypto bypass must be inactive', () => {
  it('does not run the suite with LOAD_TEST_MODE enabled', () => {
    expect(process.env.LOAD_TEST_MODE).toBeUndefined();
  });

  it('uses a deterministic admin token supplied by test setup', () => {
    expect(process.env.ADMIN_TOKEN).toBe('test-admin-token');
  });

  it('never writes to a real database file', () => {
    expect(process.env.DB_STORAGE).toBe(':memory:');
  });
});
