import { Router } from 'express';
import { AdminJudgerController } from '../../controllers/admin/admin-judger.controller';

const router = Router();

// Accept a judging run and return a handle. Does not wait for it to finish.
router.post('/judge/:testId', AdminJudgerController.judgeCode);

// Same semantics, addressed by body rather than path. The TA-facing re-judge
// action has been calling this route all along and receiving 404s.
router.post('/rejudge', AdminJudgerController.rejudge);

// Track a run.
router.get('/jobs/:jobId', AdminJudgerController.getJob);

// Judging settings, with the origin of each effective value.
router.get('/settings', AdminJudgerController.getSettings);
router.put('/settings', AdminJudgerController.updateSettings);

// Is the execution backend usable, and which languages does it actually have?
router.get('/health', AdminJudgerController.health);

export default router;
