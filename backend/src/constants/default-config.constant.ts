import { ExamConfig } from "../schemas/config.schema";
import { JUDGE_DEFAULTS } from "../config/judge.config";

export const DEFAULT_EXAM_CONFIG: ExamConfig = {
  testTitle: "Default Exam",
  description: "This is a default generated exam config.",
  submitGraceSeconds: 60,
  judgerSettings: {
    timeLimit: 1000,
    memoryLimit: 256,
    compareMode: "loose",
    // Sourced from one place, so this constant cannot drift from what the
    // resolver actually applies.
    ...JUDGE_DEFAULTS,
  },
  environmentVariables: {
    startPassword: "ntut",
  },
  accessibleUsers: [],
  sections: [],
};
