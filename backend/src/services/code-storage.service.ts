import { Submission } from '../models/submission.model';
import { SubmitCodePayload, SubmissionRecord } from '../types/submission.type';
import { Op } from 'sequelize';
import logger from '../utils/logger.util';

export class CodeStorageService {
  /**
   * Upsert a submission. If it exists for the same testId and questionId, it will be updated.
   */
  public static async upsertSubmission(testId: string, payload: SubmitCodePayload): Promise<void> {
    try {
      await Submission.upsert({
        testId,
        questionId: payload.questionId,
        language: payload.language,
        codeContent: payload.codeContent,
        submitTime: new Date()
      });
    } catch (error: any) {
      logger.error(`CodeStorageService.upsertSubmission error for ${testId}: ${error.message}`);
      throw new Error('Failed to save submission');
    }
  }

  public static async getSubmissions(testId: string, questionIds?: string[]): Promise<SubmissionRecord[]> {
    const whereClause: any = { testId };
    
    if (questionIds && questionIds.length > 0) {
      whereClause.questionId = { [Op.in]: questionIds };
    }

    const submissions = await Submission.findAll({
      where: whereClause,
      attributes: ['questionId', 'language', 'codeContent', 'submitTime'],
      order: [['submitTime', 'DESC']]
    });

    return submissions.map(sub => ({
      questionId: sub.questionId,
      language: sub.language,
      codeContent: sub.codeContent,
      submitTime: sub.submitTime
    }));
  }

  /**
   * Get a flat list of question IDs that the student has submitted code for.
   */
  static async getSubmittedQuestionIds(testId: string): Promise<string[]> {
    const records = await Submission.findAll({
      where: { testId },
      attributes: ["questionId"]
    });
    return records.map(r => r.questionId);
  }

  /**
   * Get a list of all distinct testIds (students) who have submitted code.
   */
  static async getSubmittedStudents(): Promise<string[]> {
    const records = await Submission.findAll({
      attributes: ["testId"],
      group: ["testId"]
    });
    return records.map(r => r.testId);
  }

  public static async getLatestCodeAsString(testId: string, questionId: string): Promise<string> {
    const submission = await Submission.findOne({
      where: { testId, questionId },
      attributes: ['codeContent'],
      order: [['submitTime', 'DESC']]
    });

    if (!submission) {
      throw new Error(`Submission not found for testId: ${testId}, questionId: ${questionId}`);
    }

    return submission.codeContent;
  }
}
