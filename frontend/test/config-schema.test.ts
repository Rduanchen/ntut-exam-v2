import { describe, it, expect } from 'vitest';

import fixture from './fixtures/exam-config-payload.fixture.json';
import type { ExamConfig } from '../src/types/config';

/**
 * The third definition of the exam config.
 *
 * The backend has a zod schema, the desktop client has another on a different
 * zod major, and this console has a TypeScript type for its settings form.
 * They share no code. A comment in `src/types/config.ts` records what happened
 * last time nothing bound them together: the type described a pre-004 schema
 * for some time and nothing caught it.
 *
 * This file is the binding. It is a type-level check, not a parse — the console
 * has no runtime schema — so the assertions that matter here are the ones the
 * compiler makes when the fixture is assigned to `ExamConfig`.
 *
 * Loaded as a JSON import rather than read from disk: this project's tests are
 * type-checked with the DOM lib and no node types, and the build checks them.
 */

/** The paper as the settings form edits it: both halves, back together. */
function assembled(variant: 'full' | 'minimal'): ExamConfig {
  const { meta } = fixture[variant].payload as any;
  const secret = fixture[variant].secret as any;
  const byId = new Map<string, any>(secret.puzzles.map((p: any) => [p.id, p]));

  return {
    testTitle: meta.testTitle,
    description: meta.description,
    environmentVariables: { startPassword: 'exam-start-password' },
    judgerSettings: meta.judgerSettings,
    submitGraceSeconds: meta.submitGraceSeconds,
    accessibleUsers: meta.accessibleUsers,
    globalSpecialRules: secret.globalSpecialRules,
    sections: meta.sections.map((section: any) => ({
      ...section,
      puzzles: section.puzzles.map((puzzle: any) => ({
        ...puzzle,
        ...byId.get(puzzle.id),
      })),
    })),
  };
}

describe('the console type against the contract fixture', () => {
  it.each(['full', 'minimal'] as const)('accepts the %s paper', (variant) => {
    // Compiles only if every field the fixture carries exists on ExamConfig.
    const config: ExamConfig = assembled(variant);

    expect(config.testTitle).toBeTruthy();
    expect(config.sections.length).toBeGreaterThan(0);
  });

  it('knows about submitGraceSeconds', () => {
    /* Added by feature 007. The form has to be able to edit it, and the type
     * is what the form binds to — so a field the backend requires but this
     * type lacks is a field the operator cannot set. */
    const config = assembled('full');

    expect(config.submitGraceSeconds).toBe(60);
  });

  it('treats submitGraceSeconds as optional, matching the paper', () => {
    const config = assembled('minimal');

    expect(config.submitGraceSeconds).toBeUndefined();
  });

  it('carries every judger setting the backend may send', () => {
    const config = assembled('full');
    const settings = config.judgerSettings;

    expect(settings.compileTimeout).toBeDefined();
    expect(settings.compileMemoryLimit).toBeDefined();
    expect(settings.maxConcurrentJobs).toBeDefined();
    expect(settings.maxSystemRetries).toBeDefined();
  });

  it('reassembles puzzles with both halves present', () => {
    const puzzle = assembled('full').sections[0].puzzles[0];

    expect(puzzle.id).toBe('P1');
    expect(puzzle.language).toBe('Cpp');
    expect(puzzle.title).toBe('兩數相加');
    expect(puzzle.subtasks[0].hidden.length).toBeGreaterThan(0);
  });
});
