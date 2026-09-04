import { describe, it, expect } from 'vitest';

import {
  ExamConfigCryptoService,
  WEAK_PASSWORD_LENGTH,
} from '../../../src/services/exam-config-crypto.service';
import { buildExamConfig } from '../../fixtures/exam-config.fixture';

const config = () => buildExamConfig();

describe('ExamConfigCryptoService', () => {
  describe('what the meta half may carry', () => {
    /* The whole point of the split. A student's machine holds this before the
     * exam starts, so anything here is something they can read early. */
    const forbidden = [
      'input',
      'output',
      'subtasks',
      'specialRules',
      'startPassword',
      'Two Sum', // the puzzle title from the fixture
    ];

    it.each(forbidden)('does not leak %s', (needle) => {
      const { meta } = ExamConfigCryptoService.prepare(config());

      expect(JSON.stringify(meta)).not.toContain(needle);
    });

    it('carries what the environment check needs', () => {
      const { meta } = ExamConfigCryptoService.prepare(config());

      const puzzle = meta.sections[0].puzzles[0];
      expect(puzzle).toEqual({
        id: 'Q1',
        language: 'Python',
        timeLimit: 1000,
        memoryLimit: 32768,
      });
      expect(meta.judgerSettings.timeLimit).toBeGreaterThan(0);
      expect(meta.accessibleUsers.length).toBeGreaterThan(0);
    });

    it('carries no puzzle score, so the shape of the paper stays hidden', () => {
      const { meta } = ExamConfigCryptoService.prepare(config());

      expect(meta.sections[0].puzzles[0]).not.toHaveProperty('score');
    });
  });

  describe('the ciphered half', () => {
    it('round-trips under the exam key', () => {
      const { examKey, cipher } = ExamConfigCryptoService.prepare(config());

      const secret = ExamConfigCryptoService.decryptSecret(cipher, examKey);

      expect(secret.puzzles[0]).toMatchObject({ id: 'Q1', title: 'Two Sum' });
      expect(secret.puzzles[0].subtasks[0].hidden.length).toBeGreaterThan(0);
    });

    it('uses a fresh IV every time', () => {
      const paper = config();
      const key = ExamConfigCryptoService.generateExamKey();
      const secret = ExamConfigCryptoService.buildSecret(paper);

      const first = ExamConfigCryptoService.encryptSecret(secret, key);
      const second = ExamConfigCryptoService.encryptSecret(secret, key);

      expect(first.iv).not.toBe(second.iv);
      expect(first.ciphertext).not.toBe(second.ciphertext);
    });

    it('refuses a tampered ciphertext rather than returning part of a paper', () => {
      /* Authenticated encryption is the point: a paper that has been altered
       * must not decrypt at all. Falling back to an empty or partial paper
       * would mark students against something nobody wrote. */
      const { examKey, cipher } = ExamConfigCryptoService.prepare(config());

      const tag = Buffer.from(cipher.tag, 'base64');
      tag[0] ^= 0xff;

      expect(() =>
        ExamConfigCryptoService.decryptSecret({ ...cipher, tag: tag.toString('base64') }, examKey),
      ).toThrow();
    });

    it('cannot be read with a different exam key', () => {
      const { cipher } = ExamConfigCryptoService.prepare(config());

      expect(() =>
        ExamConfigCryptoService.decryptSecret(cipher, ExamConfigCryptoService.generateExamKey()),
      ).toThrow();
    });
  });

  describe('the two ways to obtain the key', () => {
    it('produce the same key, byte for byte', () => {
      /* The property the whole offline path rests on. If these could differ,
       * a machine that started on the spoken password would decrypt a
       * different paper from one that asked the backend. */
      const paper = config();
      const { examKey, meta } = ExamConfigCryptoService.prepare(paper);

      const fromPassword = ExamConfigCryptoService.unwrapExamKey(
        meta.wrappedExamKey,
        paper.environmentVariables.startPassword,
      );

      expect(fromPassword).toBe(examKey);
    });

    it('decrypt the same paper', () => {
      const paper = config();
      const { meta, cipher } = ExamConfigCryptoService.prepare(paper);

      const key = ExamConfigCryptoService.unwrapExamKey(
        meta.wrappedExamKey,
        paper.environmentVariables.startPassword,
      );

      expect(ExamConfigCryptoService.decryptSecret(cipher, key).puzzles[0].title).toBe('Two Sum');
    });

    it('refuses the wrong password', () => {
      const { meta } = ExamConfigCryptoService.prepare(config());

      expect(() => ExamConfigCryptoService.unwrapExamKey(meta.wrappedExamKey, 'wrong')).toThrow();
    });

    it('uses a fresh salt per exam, so two papers never share a wrapping key', () => {
      const first = ExamConfigCryptoService.prepare(config());
      const second = ExamConfigCryptoService.prepare(config());

      expect(first.meta.wrappedExamKey.salt).not.toBe(second.meta.wrappedExamKey.salt);
    });
  });

  describe('password strength', () => {
    it('flags a password short enough to guess offline', () => {
      const short = buildExamConfig({
        environmentVariables: { startPassword: 'a'.repeat(WEAK_PASSWORD_LENGTH - 1) },
      });

      expect(ExamConfigCryptoService.prepare(short).passwordIsWeak).toBe(true);
    });

    it('does not flag one at the threshold', () => {
      const ok = buildExamConfig({
        environmentVariables: { startPassword: 'a'.repeat(WEAK_PASSWORD_LENGTH) },
      });

      expect(ExamConfigCryptoService.prepare(ok).passwordIsWeak).toBe(false);
    });
  });

  describe('reissuing an updated paper', () => {
    it('keeps the key already in circulation', () => {
      /* Machines are holding this key and the password has already been read
       * out. A new key would strand everyone mid-exam. */
      const { examKey, meta } = ExamConfigCryptoService.prepare(config());

      const updated = buildExamConfig({ testTitle: 'Amended Paper' });
      const reissued = ExamConfigCryptoService.reissue(updated, examKey, meta.wrappedExamKey);

      expect(reissued.meta.wrappedExamKey).toEqual(meta.wrappedExamKey);
      expect(
        ExamConfigCryptoService.decryptSecret(reissued.cipher, examKey).puzzles[0].title,
      ).toBe('Two Sum');
      expect(reissued.meta.testTitle).toBe('Amended Paper');
    });
  });

  describe('generateExamKey', () => {
    it('produces a distinct 256-bit key each time', () => {
      const a = ExamConfigCryptoService.generateExamKey();
      const b = ExamConfigCryptoService.generateExamKey();

      expect(a).toHaveLength(64);
      expect(a).not.toBe(b);
    });
  });
});
