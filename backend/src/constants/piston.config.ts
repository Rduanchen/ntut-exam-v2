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

export const checkPistonServer = async () => {
  try {
    const response = await fetch(CONFIG.url, {
      method: "GET",
    });
    if (!response.ok) {
      console.error(`[Error] Piston server at ${CONFIG.url} is not running correctly. Status: ${response.status}`);
    } else {
      console.log(`[Info] Piston server is reachable at ${CONFIG.url}`);
    }
  } catch (error: any) {
    console.error(`[Error] Failed to reach Piston server at ${CONFIG.url}. Is it reachable? Error: ${error.message}`);
  }
};
