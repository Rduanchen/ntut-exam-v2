import { describe, it, expect, beforeEach, vi } from 'vitest';
import type express from 'express';
import { createApp } from '../../src/app';
import { adminRequest } from '../helpers/admin-request';
import { buildExamConfig } from '../fixtures/exam-config.fixture';
import { SystemSettings } from '../../src/models/system-settings.model';
import { ExamConfigService } from '../../src/services/exam-config.service';
import { SystemSettingsService } from '../../src/services/system-settings.service';
import { JUDGE_DEFAULTS } from '../../src/config/judge.config';
import { getExecutionCeiling } from '../../src/services/judge-limiter';
import * as pistonConfig from '../../src/constants/piston.config';

describe('US4 - one configuration file configures one machine', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    await SystemSettings.upsert({
      name: 'exam_config',
      value: JSON.stringify(buildExamConfig()),
    });
  });

  it('applies judging settings carried by an uploaded configuration', async () => {
    const config = buildExamConfig();
    config.judgerSettings.maxConcurrentJobs = 9;
    config.judgerSettings.compileTimeout = 45000;

    await ExamConfigService.validateAndSave(config);
    const res = await adminRequest(app).get('/admin/judger/settings');

    expect(res.status).toBe(200);
    expect(res.body.settings.maxConcurrentJobs).toEqual({ value: 9, origin: 'config' });
    expect(res.body.settings.compileTimeout.value).toBe(45000);
    expect(getExecutionCeiling()).toBe(9);
  });

  it('falls back to defaults when a configuration omits them, rather than keeping the old values', async () => {
    // The assertion that distinguishes replacement from merge. A merging
    // implementation passes the previous test and fails this one.
    const withSettings = buildExamConfig();
    withSettings.judgerSettings.maxConcurrentJobs = 9;
    await ExamConfigService.validateAndSave(withSettings);

    const without = buildExamConfig();
    delete (without.judgerSettings as Record<string, unknown>).maxConcurrentJobs;
    await ExamConfigService.validateAndSave(without);

    const res = await adminRequest(app).get('/admin/judger/settings');
    expect(res.body.settings.maxConcurrentJobs.value).toBe(JUDGE_DEFAULTS.maxConcurrentJobs);
    expect(res.body.settings.maxConcurrentJobs.value).not.toBe(9);
  });

  it('lets a later configuration upload override the management interface', async () => {
    // Intended, not a defect: asserted so it is not "fixed" later.
    await adminRequest(app).put('/admin/judger/settings').send({ maxConcurrentJobs: 12 });
    expect(getExecutionCeiling()).toBe(12);

    const uploaded = buildExamConfig();
    uploaded.judgerSettings.maxConcurrentJobs = 3;
    await ExamConfigService.validateAndSave(uploaded);

    const res = await adminRequest(app).get('/admin/judger/settings');
    expect(res.body.settings.maxConcurrentJobs.value).toBe(3);
  });

  it('does not preserve judging settings across a restricted update', async () => {
    // Guards the regression that would silently restore merge semantics.
    const base = buildExamConfig();
    base.judgerSettings.maxConcurrentJobs = 11;
    await ExamConfigService.validateAndSave(base);

    const incoming = buildExamConfig();
    delete (incoming.judgerSettings as Record<string, unknown>).maxConcurrentJobs;
    await ExamConfigService.restrictedUpdate(incoming);

    const stored = await SystemSettingsService.getExamConfig();
    expect(stored.judgerSettings.maxConcurrentJobs).toBe(JUDGE_DEFAULTS.maxConcurrentJobs);
  });

  it('reports where each effective value came from', async () => {
    // Without provenance, "10 seconds because someone measured" and
    // "10 seconds because nobody chose" are indistinguishable -- which is how
    // the original silent allowance stayed invisible until it cost marks.
    const res = await adminRequest(app).get('/admin/judger/settings');

    for (const key of ['compileTimeout', 'maxConcurrentJobs', 'maxSystemRetries']) {
      expect(res.body.settings[key]).toHaveProperty('origin');
      expect(['config', 'env', 'default', 'clamped']).toContain(res.body.settings[key].origin);
    }
  });

  it('marks an out-of-range ceiling as clamped instead of honouring it', async () => {
    const res = await adminRequest(app).put('/admin/judger/settings').send({
      maxConcurrentJobs: 100000,
    });

    expect(res.body.settings.maxConcurrentJobs.origin).toBe('clamped');
    expect(res.body.activeCeiling).toBeLessThan(100000);
  });

  it('applies a settings change immediately, with no restart', async () => {
    await adminRequest(app).put('/admin/judger/settings').send({ maxConcurrentJobs: 6 });
    expect(getExecutionCeiling()).toBe(6);
  });
});

describe('US4 - backend health is visible before an exam', () => {
  let app: express.Express;
  beforeEach(() => {
    app = createApp();
    vi.restoreAllMocks();
  });

  it('reports reachability and the languages actually installed', async () => {
    vi.spyOn(pistonConfig, 'checkPistonServer').mockResolvedValue({
      reachable: true,
      url: 'http://localhost:2000',
      runtimes: [{ language: 'c', version: '10.2.0' }],
    });

    const res = await adminRequest(app).get('/admin/judger/health');

    expect(res.status).toBe(200);
    expect(res.body.reachable).toBe(true);
    expect(res.body.runtimes).toHaveLength(1);
    expect(res.body.checkedAt).toBeTypeOf('number');
  });

  it('reports an unreachable backend as an answer, not as an error', async () => {
    vi.spyOn(pistonConfig, 'checkPistonServer').mockResolvedValue({
      reachable: false,
      url: 'http://localhost:2000',
      runtimes: [],
      error: 'ECONNREFUSED',
    });

    const res = await adminRequest(app).get('/admin/judger/health');

    expect(res.status).toBe(200);
    expect(res.body.reachable).toBe(false);
    expect(res.body.error).toBe('ECONNREFUSED');
  });
});
