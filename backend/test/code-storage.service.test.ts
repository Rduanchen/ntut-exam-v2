import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { Sequelize } from 'sequelize-typescript';
import { CodeStorageService } from '../src/services/code-storage.service';
import { Submission } from '../src/models/submission.model';
import { User } from '../src/models/user.model';

import { ScoreBoard } from '../src/models/score-board.model';
import { DeviceKeyMap } from '../src/models/device-key-map.model';
import { UserActionLog } from '../src/models/user-action-log.model';
import { Message } from '../src/models/message.model';
import { SystemSettings } from '../src/models/system-settings.model';
import { ViolationLog } from '../src/models/violation-log.model';

describe('CodeStorageService', () => {
  let testSequelize: Sequelize;
  const testId = 'test-student-1';
  const questionId = 'Q1';
  const language = 'python';
  const codeContent = 'print("Hello World")';

  beforeAll(async () => {
    testSequelize = new Sequelize({
      dialect: "sqlite",
      storage: ":memory:",
      models: [DeviceKeyMap, User, Submission, ScoreBoard, UserActionLog, ViolationLog, Message, SystemSettings],
      logging: false,
    });
    await testSequelize.sync();
  });

  afterAll(async () => {
    await testSequelize.close();
  });

  beforeEach(async () => {
    await Submission.destroy({ where: {} });
    await User.destroy({ where: {} });
    await User.create({ testId, name: 'Test Student', password: 'password', ipAddress: '127.0.0.1' });
  });

  it('should insert a new submission successfully', async () => {
    await CodeStorageService.upsertSubmission(testId, { questionId, language, codeContent });
    
    const submissions = await CodeStorageService.getSubmissions(testId);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].questionId).toBe(questionId);
    expect(submissions[0].codeContent).toBe(codeContent);
  });

  it('should update an existing submission (upsert) successfully', async () => {
    await CodeStorageService.upsertSubmission(testId, { questionId, language, codeContent });
    
    const newCodeContent = 'print("Updated Code")';
    await CodeStorageService.upsertSubmission(testId, { questionId, language, codeContent: newCodeContent });
    
    const submissions = await CodeStorageService.getSubmissions(testId);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].codeContent).toBe(newCodeContent);
  });

  it('should get submitted question ids', async () => {
    await CodeStorageService.upsertSubmission(testId, { questionId: 'Q1', language: 'python', codeContent: 'print("Q1")' });
    await CodeStorageService.upsertSubmission(testId, { questionId: 'Q2', language: 'python', codeContent: 'print("Q2")' });
    
    const ids = await CodeStorageService.getSubmittedQuestionIds(testId);
    expect(ids.sort()).toEqual(['Q1', 'Q2']);
  });

  it('should get the latest code as string', async () => {
    await CodeStorageService.upsertSubmission(testId, { questionId, language, codeContent });
    const code = await CodeStorageService.getLatestCodeAsString(testId, questionId);
    expect(code).toBe(codeContent);
  });

  it('should throw an error if getting latest code for a non-existent submission', async () => {
    await expect(CodeStorageService.getLatestCodeAsString(testId, 'Q99')).rejects.toThrow(/Submission not found/);
  });
});
