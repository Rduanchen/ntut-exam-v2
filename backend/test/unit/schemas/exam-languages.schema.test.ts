import { describe, it, expect } from 'vitest';
import { examLanguagesSchema } from '../../../src/schemas/exam-languages.schema';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
const fixture = z.object({ valid: z.array(z.unknown()), invalid: z.array(z.unknown()) }).parse(
  JSON.parse(fs.readFileSync(path.join(__dirname, '../../fixtures/exam-languages.fixture.json'), 'utf8'))
);
describe('exam language contract', () => {
  it.each(fixture.valid.map(value => ({ value })))('accepts canonical response %j', ({ value }) => expect(examLanguagesSchema.safeParse(value).success).toBe(true));
  it.each(fixture.invalid.map(value => ({ value })))('rejects malformed response %j', ({ value }) => expect(examLanguagesSchema.safeParse(value).success).toBe(false));
});
