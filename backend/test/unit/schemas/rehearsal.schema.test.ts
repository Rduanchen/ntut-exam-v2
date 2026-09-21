import { describe, expect, it } from 'vitest';
import { rehearsalRunSchema, rehearsalStartInputSchema } from '../../../src/schemas/rehearsal.schema';
import { REHEARSAL_STAGE_IDS } from '../../../src/types/rehearsal.type';
import { rehearsalRun, rehearsalStage } from '../../fixtures/rehearsal.fixture';

describe('rehearsal start input', () => {
  it('requires the wipe acknowledgement to be literally true', () => {
    expect(rehearsalStartInputSchema.safeParse({ acknowledgeWipe: true }).success).toBe(true);
    expect(rehearsalStartInputSchema.safeParse({ acknowledgeWipe: false }).success).toBe(false);
    expect(rehearsalStartInputSchema.safeParse({}).success).toBe(false);
    // Truthy is not the same as acknowledged.
    expect(rehearsalStartInputSchema.safeParse({ acknowledgeWipe: 'yes' }).success).toBe(false);
  });

  it('rejects unknown fields rather than ignoring them', () => {
    expect(rehearsalStartInputSchema.safeParse({ acknowledgeWipe: true, skipCleanup: true }).success).toBe(false);
  });
});

describe('rehearsal run envelope', () => {
  it('accepts a well-formed run', () => {
    expect(rehearsalRunSchema.safeParse(rehearsalRun()).success).toBe(true);
  });

  it('requires exactly the six stages, in order, without duplicates', () => {
    const missing = rehearsalRun({ stages: REHEARSAL_STAGE_IDS.slice(0, 5).map((id) => rehearsalStage(id)) });
    expect(rehearsalRunSchema.safeParse(missing).success).toBe(false);

    const reordered = rehearsalRun({
      stages: [...REHEARSAL_STAGE_IDS].reverse().map((id) => rehearsalStage(id)),
    });
    expect(rehearsalRunSchema.safeParse(reordered).success).toBe(false);

    const duplicated = rehearsalRun({ stages: REHEARSAL_STAGE_IDS.map(() => rehearsalStage('paper')) });
    expect(rehearsalRunSchema.safeParse(duplicated).success).toBe(false);
  });

  it('refuses a terminal run that carries no verdict or no end time', () => {
    // A report in this shape renders as "still running" forever.
    expect(rehearsalRunSchema.safeParse(rehearsalRun({ overallOutcome: undefined })).success).toBe(false);
    expect(rehearsalRunSchema.safeParse(rehearsalRun({ finishedAt: undefined })).success).toBe(false);
  });

  it('allows a non-terminal run to carry neither', () => {
    const running = rehearsalRun({ state: 'running', overallOutcome: undefined, finishedAt: undefined, currentStage: 'enrol' });
    expect(rehearsalRunSchema.safeParse(running).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(rehearsalRunSchema.safeParse({ ...rehearsalRun(), sneaky: 1 }).success).toBe(false);
  });
});
