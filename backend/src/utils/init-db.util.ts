import { StatusCode } from "piston-judger/dist/judger.js";
import { Section } from "../schemas/config.schema";
import {
  ScoreBoardFormat,
  Subtasks,
  TestCaseRecord,
} from "../types/scoreboard.type";

const emptyTestCaseRecord: TestCaseRecord = {
  status: StatusCode.WA,
  userOutput: "",
  expectedOutput: "",
  time: "0",
};

export function getDefaultScoreboard(sections: Section[]): ScoreBoardFormat {
  const defaultScoreBoard: ScoreBoardFormat = {};
  for (const section of sections) {
    for (const puzzle of section.puzzles) {
      const defaultPuzzle: Subtasks[] = [];

      for (const subtask of puzzle.subtasks) {
        const visibleTestCases = subtask.visible.map(() => ({ ...emptyTestCaseRecord }));
        const hiddenTestCases = subtask.hidden.map(() => ({ ...emptyTestCaseRecord }));

        defaultPuzzle.push({
          visible: visibleTestCases,
          hidden: hiddenTestCases,
        });
      }

      defaultScoreBoard[puzzle.id] = {
        subtasks: defaultPuzzle,
        specialRuleResults: [],
      };
    }
  }

  return defaultScoreBoard;
}
