import { describe, it, expect, beforeEach } from 'vitest';
import { CodeStorageService } from '../../../src/services/code-storage.service';
import { Submission } from '../../../src/models/submission.model';
import { User } from '../../../src/models/user.model';


describe('CodeStorageService', () => {
  const testId = 'test-student-1';
  const questionId = 'Q1';
  const language = 'python';
  const codeContent = 'print("Hello World")';

  beforeEach(async () => {
    await Submission.destroy({ where: {} });
    await User.destroy({ where: {} });
    await User.create({ testId, name: 'Test Student', password: 'password', ipAddress: '127.0.0.1' });
    // Submission.testId is a foreign key to users; seed the extra students the
    // multi-student suites below rely on.
    await User.create({ testId: 's-1', name: 'Student One' });
    await User.create({ testId: 's-2', name: 'Student Two' });
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

  describe('getSubmissions', () => {
    it('returns every submission for a student, newest first', async () => {
      await CodeStorageService.upsertSubmission('s-1', {
        questionId: 'Q1', language: 'Python', codeContent: 'print(1)'
      } as any);
      await CodeStorageService.upsertSubmission('s-1', {
        questionId: 'Q2', language: 'Python', codeContent: 'print(2)'
      } as any);

      const rows = await CodeStorageService.getSubmissions('s-1');

      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveProperty('questionId');
      expect(rows[0]).toHaveProperty('codeContent');
      expect(rows[0]).toHaveProperty('submitTime');
    });

    it('filters to the requested question ids', async () => {
      await CodeStorageService.upsertSubmission('s-1', {
        questionId: 'Q1', language: 'Python', codeContent: 'print(1)'
      } as any);
      await CodeStorageService.upsertSubmission('s-1', {
        questionId: 'Q2', language: 'Python', codeContent: 'print(2)'
      } as any);

      const rows = await CodeStorageService.getSubmissions('s-1', ['Q2']);

      expect(rows).toHaveLength(1);
      expect(rows[0].questionId).toBe('Q2');
    });

    it('ignores an empty filter list and returns everything', async () => {
      await CodeStorageService.upsertSubmission('s-1', {
        questionId: 'Q1', language: 'Python', codeContent: 'print(1)'
      } as any);

      expect(await CodeStorageService.getSubmissions('s-1', [])).toHaveLength(1);
    });

    it('returns an empty list for a student with no submissions', async () => {
      expect(await CodeStorageService.getSubmissions('nobody')).toHaveLength(0);
    });
  });

  describe('getSubmittedStudents', () => {
    it('returns each student once, however many submissions they made', async () => {
      await CodeStorageService.upsertSubmission('s-1', {
        questionId: 'Q1', language: 'Python', codeContent: 'a'
      } as any);
      await CodeStorageService.upsertSubmission('s-1', {
        questionId: 'Q2', language: 'Python', codeContent: 'b'
      } as any);
      await CodeStorageService.upsertSubmission('s-2', {
        questionId: 'Q1', language: 'Python', codeContent: 'c'
      } as any);

      const students = await CodeStorageService.getSubmittedStudents();

      expect(students.sort()).toEqual(['s-1', 's-2']);
    });

    it('returns an empty list when nobody has submitted', async () => {
      expect(await CodeStorageService.getSubmittedStudents()).toHaveLength(0);
    });
  });

  describe('deleteSubmissions', () => {
    it('deletes a single question when a questionId is given', async () => {
      await CodeStorageService.upsertSubmission('s-1', {
        questionId: 'Q1', language: 'Python', codeContent: 'a'
      } as any);
      await CodeStorageService.upsertSubmission('s-1', {
        questionId: 'Q2', language: 'Python', codeContent: 'b'
      } as any);

      await CodeStorageService.deleteSubmissions('s-1', 'Q1');

      expect(await CodeStorageService.getSubmittedQuestionIds('s-1')).toEqual(['Q2']);
    });

    it('deletes every submission for the student when no questionId is given', async () => {
      await CodeStorageService.upsertSubmission('s-1', {
        questionId: 'Q1', language: 'Python', codeContent: 'a'
      } as any);
      await CodeStorageService.upsertSubmission('s-2', {
        questionId: 'Q1', language: 'Python', codeContent: 'b'
      } as any);

      await CodeStorageService.deleteSubmissions('s-1');

      expect(await CodeStorageService.getSubmittedQuestionIds('s-1')).toHaveLength(0);
      // Another student's work must be untouched.
      expect(await CodeStorageService.getSubmittedQuestionIds('s-2')).toEqual(['Q1']);
    });

    it('is a no-op for a student with nothing stored', async () => {
      await expect(CodeStorageService.deleteSubmissions('nobody')).resolves.toBeUndefined();
    });
  });
});
