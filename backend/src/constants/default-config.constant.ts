import { ExamConfig } from "../schemas/config.schema";

export const DEFAULT_EXAM_CONFIG: ExamConfig = {
  testTitle: "Default Exam",
  description: "This is a default generated exam config.",
  judgerSettings: {
    timeLimit: 1000,
    memoryLimit: 256,
    compareMode: "loose",
  },
  environmentVariables: {
    startPassword: "ntut",
  },
  accessibleUsers: [],
  sections: [],
};
