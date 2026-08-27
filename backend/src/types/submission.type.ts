/**
 * The judging lifecycle of one submission, as a closed set.
 *
 * Previously an unconstrained string, which meant a fifth value could appear
 * by typo with nothing to catch it. This feature adds a state, so the set is
 * closed first.
 *
 * `SystemError` replaces the former `"Error"`. That value was only ever written
 * when judging itself failed -- a system fault -- but it was named as though the
 * student owned it. Renaming it makes the distinction the grading rules depend
 * on visible in the type rather than implied by a comment.
 */
export const SUBMISSION_STATUSES = [
  "Pending",
  "Judging",
  "Graded",
  "SystemError",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Statuses that contribute a score. Everything else contributes nothing. */
export const SCORING_STATUSES: readonly SubmissionStatus[] = ["Graded"];

/**
 * A submission left here by an interrupted run. Only this state is transient,
 * so it is the only one startup recovery needs to consider.
 */
export const IN_FLIGHT_STATUS: SubmissionStatus = "Judging";

export interface SubmitCodePayload {
  questionId: string;
  language: string;
  codeContent: string;
}

export interface SubmissionRecord {
  questionId: string;
  language: string;
  codeContent: string;
  submitTime: Date;
}
