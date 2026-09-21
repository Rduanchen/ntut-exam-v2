import crypto from "crypto";

import { CryptoService } from "./crypto.service";
import type {
  EncryptedEnvelope,
  ExamConfig,
  ExamConfigMeta,
  ExamConfigSecret,
  WrappedExamKey
} from "../schemas/config.schema";

/**
 * Splitting the exam paper into what may leave the backend early and what may
 * not, and the key that separates them.
 *
 * The device AES key already protects every request, but it is held by the
 * student whose machine it belongs to — so it cannot keep the paper unreadable
 * on that machine. Before this, the whole paper became readable the moment a
 * student logged in, and logging in happens before the exam starts.
 *
 * `K_exam` is the second key. Papers are delivered early, in ciphertext; the
 * backend withholds the key until IN_PROGRESS.
 */

/** PBKDF2 rounds for deriving the wrapping key from the invigilator's password. */
export const PASSWORD_KDF_ITERATIONS = 600_000;

/** Below this, the console warns before generating. */
export const WEAK_PASSWORD_LENGTH = 6;

const KEY_BYTES = 32;
const SALT_BYTES = 16;

export interface PreparedExamPaper {
  examKey: string;
  meta: ExamConfigMeta;
  cipher: EncryptedEnvelope;
  /** True when the password is short enough that the console should confirm. */
  passwordIsWeak: boolean;
}

export class ExamConfigCryptoService {
  /** A fresh exam key. One per exam; never reused across a reset. */
  static generateExamKey(): string {
    return crypto.randomBytes(KEY_BYTES).toString("hex");
  }

  /**
   * The half of the paper that may reach a machine before the exam starts.
   *
   * Carries what the environment check needs — which languages, at which
   * limits — and what the entry flow needs, and nothing that would tell a
   * student what the exam is about. Puzzle titles are excluded for that
   * reason: "Shortest Path" gives away as much as the statement.
   */
  static buildMeta(config: ExamConfig, wrappedExamKey: WrappedExamKey): ExamConfigMeta {
    return {
      testTitle: config.testTitle,
      description: config.description,
      accessibleUsers: config.accessibleUsers,
      judgerSettings: config.judgerSettings,
      submitGraceSeconds: config.submitGraceSeconds,
      sections: config.sections.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description,
        maxScore: section.maxScore,
        puzzles: section.puzzles.map((puzzle) => ({
          id: puzzle.id,
          language: puzzle.language,
          timeLimit: puzzle.timeLimit,
          memoryLimit: puzzle.memoryLimit
        }))
      })),
      wrappedExamKey
    };
  }

  /** Everything the meta half deliberately leaves out. */
  static buildSecret(config: ExamConfig): ExamConfigSecret {
    return {
      puzzles: config.sections.flatMap((section) =>
        section.puzzles.map((puzzle) => ({
          id: puzzle.id,
          title: puzzle.title,
          score: puzzle.score,
          subtasks: puzzle.subtasks,
          specialRules: puzzle.specialRules
        }))
      ),
      globalSpecialRules: config.globalSpecialRules
    };
  }

  /** Encrypt the secret half under the exam key. */
  static encryptSecret(secret: ExamConfigSecret, examKeyHex: string): EncryptedEnvelope {
    const encrypted = CryptoService.encryptAESGCM(
      JSON.stringify(secret),
      Buffer.from(examKeyHex, "hex")
    );
    return { iv: encrypted.iv, ciphertext: encrypted.ciphertext, tag: encrypted.tag };
  }

  /** Decrypt it again. Used by tests and by the offline bundle export check. */
  static decryptSecret(cipher: EncryptedEnvelope, examKeyHex: string): ExamConfigSecret {
    const plaintext = CryptoService.decryptAESGCM(
      cipher as any,
      Buffer.from(examKeyHex, "hex")
    );
    return JSON.parse(plaintext);
  }

  /**
   * Wrap the exam key with the invigilator's spoken password.
   *
   * This is the path that does not need the backend. A machine holding the
   * ciphertext can start the exam on a password read aloud in the room, which
   * is what keeps a backend outage from stopping the exam beginning at all.
   *
   * The password is short by decision, so the iteration count is the only
   * remaining cost to an offline guess — which is why it is not modest.
   */
  static wrapExamKey(examKeyHex: string, password: string): WrappedExamKey {
    const salt = crypto.randomBytes(SALT_BYTES);
    const derived = this.deriveKey(password, salt);

    const encrypted = CryptoService.encryptAESGCM(examKeyHex, derived);

    return {
      salt: salt.toString("base64"),
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      tag: encrypted.tag
    };
  }

  /**
   * Recover the exam key from the password.
   *
   * Must return exactly what the backend hands out over the network — the two
   * paths are the same key, so which one a machine used never matters.
   */
  static unwrapExamKey(wrapped: WrappedExamKey, password: string): string {
    const derived = this.deriveKey(password, Buffer.from(wrapped.salt, "base64"));
    return CryptoService.decryptAESGCM(
      { iv: wrapped.iv, ciphertext: wrapped.ciphertext, tag: wrapped.tag } as any,
      derived
    );
  }

  /** Everything the transition to INITIALIZED has to produce, in one step. */
  static prepare(config: ExamConfig): PreparedExamPaper {
    const password = config.environmentVariables.startPassword;
    const examKey = this.generateExamKey();
    const wrappedExamKey = this.wrapExamKey(examKey, password);

    return {
      examKey,
      meta: this.buildMeta(config, wrappedExamKey),
      cipher: this.encryptSecret(this.buildSecret(config), examKey),
      passwordIsWeak: password.length < WEAK_PASSWORD_LENGTH
    };
  }

  /**
   * Re-encrypt an updated paper under the key already in circulation.
   *
   * The key does not change when the paper does. Machines are already holding
   * it, and the password that unwraps it has already been spoken; issuing a new
   * one would strand every machine that is mid-exam.
   */
  static reissue(config: ExamConfig, examKey: string, wrappedExamKey: WrappedExamKey) {
    return {
      meta: this.buildMeta(config, wrappedExamKey),
      cipher: this.encryptSecret(this.buildSecret(config), examKey)
    };
  }

  private static deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, PASSWORD_KDF_ITERATIONS, KEY_BYTES, "sha256");
  }
}

export default ExamConfigCryptoService;
