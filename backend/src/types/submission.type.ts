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
