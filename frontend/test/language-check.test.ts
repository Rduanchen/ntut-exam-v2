import { describe, it, expect } from 'vitest';
import {
  runtimeSatisfies,
  resolveLanguageRequirements,
} from '../src/stores/judge-settings.store';
import { C_ONLY_RUNTIMES, FULL_RUNTIMES, examRequiring } from './fixtures/judge.fixture';

/**
 * US1 — can this machine run this exam paper?
 *
 * The check that did not exist when a machine with only the C family installed
 * met an exam expecting Python, and nothing anywhere said so until students
 * were sitting down.
 */
describe('US1 - language availability', () => {
  it('names a language the backend cannot run', () => {
    const required = resolveLanguageRequirements(
      examRequiring('Python', 'C'),
      C_ONLY_RUNTIMES,
    );
    const missing = required.filter((r) => !r.available);

    expect(missing).toHaveLength(1);
    expect(missing[0].examLanguage).toBe('Python');
  });

  it('matches Cpp against a runtime called c++ via its alias', () => {
    /* THE decisive test.
     *
     * The exam paper says `Cpp`; the backend says `c++`. No string
     * transformation turns one into the other, so matching on the runtime name
     * alone reports C++ missing on EVERY machine — a permanent false alarm
     * minutes before every exam. The alias list closes the gap without copying
     * the backend's mapping table. */
    const required = resolveLanguageRequirements(examRequiring('Cpp'), FULL_RUNTIMES);

    expect(required[0].available).toBe(true);
    expect(required[0].matchedRuntime?.language).toBe('c++');
  });

  it('matches every language the system supports', () => {
    const required = resolveLanguageRequirements(
      examRequiring('C', 'Cpp', 'Python', 'Java', 'JavaScript'),
      FULL_RUNTIMES,
    );

    expect(required.every((r) => r.available)).toBe(true);
  });

  it('reports an unmatched language as missing rather than omitting it', () => {
    // The safe direction: a false "missing" is visible and correctable; a false
    // "present" is discovered during the exam.
    const required = resolveLanguageRequirements(examRequiring('Rust'), FULL_RUNTIMES);

    expect(required).toHaveLength(1);
    expect(required[0].available).toBe(false);
  });

  it('treats an unreachable backend as having no runtimes, so everything is missing', () => {
    const required = resolveLanguageRequirements(examRequiring('C'), []);

    expect(required[0].available).toBe(false);
  });

  it('reports nothing when no exam configuration is available', () => {
    // The language check becomes unavailable; it must not invent requirements.
    expect(resolveLanguageRequirements(null, FULL_RUNTIMES)).toEqual([]);
  });

  it('deduplicates a language used by several questions', () => {
    const required = resolveLanguageRequirements(
      examRequiring('Python', 'Python', 'C'),
      FULL_RUNTIMES,
    );

    expect(required.map((r) => r.examLanguage)).toEqual(['C', 'Python']);
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(runtimeSatisfies(FULL_RUNTIMES[2], '  python  ')).toBe(true);
    expect(runtimeSatisfies(FULL_RUNTIMES[1], 'CPP')).toBe(true);
  });
});
