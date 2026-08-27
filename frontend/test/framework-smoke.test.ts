import { describe, it, expect } from 'vitest';

/**
 * Proves the runner works and, more importantly, that it can fail.
 *
 * The failing case below was run once deliberately and observed to fail before
 * anything else in this feature relied on the suite. A test suite that cannot
 * fail certifies whatever it is pointed at.
 */
describe('test framework', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('reports a genuine mismatch', () => {
    expect(() => expect(1).toBe(2)).toThrow();
  });
});

