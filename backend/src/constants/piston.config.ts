/* Judging *limits* deliberately do not live here.
 *
 * This module used to carry CPU_TIME_LIMIT_MS, WALL_TIME_LIMIT_MS and
 * MEMORY_LIMIT_KB. Nothing read them -- the judging service took its limits
 * from the exam configuration -- so they were three values that looked like
 * guarantees and enforced nothing. Effective limits now resolve in one place,
 * src/config/judge.config.ts, with their origin attached.
 *
 * What remains here is the language catalogue, which the exam config schema
 * uses to build its language enum, and the startup reachability probe. */
const CONFIG = {
  url: process.env.PISTON_URL || "http://localhost:2000",
  languages: {
    Python: {
      name: "python3",
      version: "3.12.0",
    },
    Cpp: {
      name: "gcc",
      version: "10.2.0",
    },
    C: {
      name: "gcc",
      version: "10.2.0",
    },
    JavaScript: {
      name: "javascript",
      version: "20.1.0",
    },
    Java: {
      name: "java",
      version: "20.0.2",
    },
  },
};
export default CONFIG;

export type LanguageKey = keyof typeof CONFIG.languages;
export type LanguageConfig = (typeof CONFIG.languages)[LanguageKey];

export interface PistonHealth {
  reachable: boolean;
  url: string;
  runtimes: Array<{ language: string; version: string; aliases?: string[] }>;
  error?: string;
}

/**
 * Report whether the execution backend is usable, and what it can actually run.
 *
 * Used to only write to the log at startup, which meant "Python is not
 * installed" was discoverable exactly once, by whoever happened to read the
 * console. An operator needs to be able to ask before an exam begins — the
 * measurement that started this work found a machine with only the gcc family
 * installed, and nothing surfaced that.
 *
 * An unreachable backend is a normal report, not a thrown error: the caller
 * asked a question and gets an answer.
 */
export const checkPistonServer = async (): Promise<PistonHealth> => {
  const url = CONFIG.url;
  try {
    const response = await fetch(`${url}/api/v2/runtimes`, { method: "GET" });
    if (!response.ok) {
      const error = `Piston responded ${response.status}`;
      console.error(`[Error] ${error} at ${url}`);
      return { reachable: false, url, runtimes: [], error };
    }
    const runtimes = (await response.json()) as PistonHealth["runtimes"];
    console.log(`[Info] Piston reachable at ${url} with ${runtimes.length} runtime(s)`);
    return { reachable: true, url, runtimes };
  } catch (error: any) {
    const message = error?.message ?? String(error);
    console.error(`[Error] Failed to reach Piston at ${url}: ${message}`);
    return { reachable: false, url, runtimes: [], error: message };
  }
};
