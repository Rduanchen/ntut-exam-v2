import { describe, it, expect } from 'vitest';

import { ExamConfigParserService } from '../../../src/services/exam-config-parser.service';
import { SystemSettings } from '../../../src/models/system-settings.model';
import { buildExamConfig } from '../../fixtures/exam-config.fixture';

const storeConfig = async (config: unknown) =>
  SystemSettings.upsert({ name: 'exam_config', value: JSON.stringify(config) });

describe('ExamConfigParserService', () => {
  describe('getConfig', () => {
    it('returns the stored exam config', async () => {
      await storeConfig(buildExamConfig({ testTitle: 'Parser Exam' }));

      const config = await ExamConfigParserService.getConfig();

      expect(config).not.toBeNull();
      expect(config.testTitle).toBe('Parser Exam');
    });

    it('returns null instead of throwing when the stored JSON is corrupt', async () => {
      await SystemSettings.destroy({ where: { name: 'exam_config' } });
      await SystemSettings.create({ name: 'exam_config', value: '{not valid json' });

      // The parser swallows the error deliberately: a corrupt config must not
      // take down every caller that merely asks whether a question exists.
      expect(await ExamConfigParserService.getConfig()).toBeNull();
    });

    it('returns null when no config has been stored', async () => {
      await SystemSettings.destroy({ where: { name: 'exam_config' } });

      expect(await ExamConfigParserService.getConfig()).toBeNull();
    });
  });

  describe('getPuzzleById', () => {
    it('finds a puzzle from the stored config', async () => {
      await storeConfig(buildExamConfig());

      const puzzle = await ExamConfigParserService.getPuzzleById('Q1');

      expect(puzzle).not.toBeNull();
      expect(puzzle.title).toBe('Two Sum');
    });

    it('returns null for an unknown puzzle id', async () => {
      await storeConfig(buildExamConfig());

      expect(await ExamConfigParserService.getPuzzleById('Q404')).toBeNull();
    });

    it('searches across every section', async () => {
      const config = buildExamConfig();
      const second = JSON.parse(JSON.stringify(config.sections[0]));
      second.id = 'S2';
      second.puzzles[0].id = 'Q2';
      second.puzzles[0].title = 'Three Sum';
      config.sections.push(second);
      await storeConfig(config);

      const puzzle = await ExamConfigParserService.getPuzzleById('Q2');
      expect(puzzle.title).toBe('Three Sum');
    });

    it('uses a provided config without touching the database', async () => {
      await SystemSettings.destroy({ where: { name: 'exam_config' } });

      const puzzle = await ExamConfigParserService.getPuzzleById('Q1', buildExamConfig());

      expect(puzzle).not.toBeNull();
    });

    it('returns null when the config has no sections', async () => {
      expect(await ExamConfigParserService.getPuzzleById('Q1', { testTitle: 'empty' })).toBeNull();
    });
  });

  describe('questionExists', () => {
    it('is true for a puzzle in the config', async () => {
      await storeConfig(buildExamConfig());

      expect(await ExamConfigParserService.questionExists('Q1')).toBe(true);
    });

    it('is false for a puzzle that is absent', async () => {
      await storeConfig(buildExamConfig());

      expect(await ExamConfigParserService.questionExists('Q404')).toBe(false);
    });
  });
});
