const CONFIG = {
  CPU_TIME_LIMIT_MS: process.env.JUDGE_CPU_TIME_LIMIT_MS
    ? Number(process.env.JUDGE_CPU_TIME_LIMIT_MS)
    : 10000, // 預設 10 秒
  WALL_TIME_LIMIT_MS: process.env.JUDGE_WALL_TIME_LIMIT_MS
    ? Number(process.env.JUDGE_WALL_TIME_LIMIT_MS)
    : 15000, // 預設 15 秒
  MEMORY_LIMIT_KB: process.env.JUDGE_MEMORY_LIMIT_KB
    ? Number(process.env.JUDGE_MEMORY_LIMIT_KB)
    : 102400, // 預設 100 MB
  url: process.env.JUDGER_URL || "http://localhost:2000",
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
