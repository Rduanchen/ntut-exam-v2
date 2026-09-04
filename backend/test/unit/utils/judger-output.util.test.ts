import { describe, expect, it } from 'vitest';
import { truncateJudgerOutput } from '../../../src/utils/judger-output.util';

describe('judger output boundary', () => {
  it('keeps diagnostics within the exact configured cap', () => {
    const result = truncateJudgerOutput('x'.repeat(6_000));
    expect(result).toHaveLength(5_000);
    expect(result).toContain('Output Truncated');
  });
  it('does not manufacture diagnostics from non-strings', () => expect(truncateJudgerOutput({ secret: true })).toBe(''));
});
