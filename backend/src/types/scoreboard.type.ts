import { StatusCode } from "piston-judger/dist/judger.js";

export interface TestCaseRecord {
  status: StatusCode;
  userOutput: string;
  expectedOutput: string;
  time: string;
}

export interface Subtasks {
  visible: TestCaseRecord[];
  hidden: TestCaseRecord[];
}

export interface ScoreBoardFormat {
  [puzzleId: string]: {
    subtasks: Subtasks[];
    specialRuleResults: any[];
  };
}
