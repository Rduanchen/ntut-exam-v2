import { Router } from 'express';
import { AdminJudgerController } from '../../controllers/admin/admin-judger.controller';

const router = Router();

// Evaluate student code submissions
router.post('/judge/:testId', AdminJudgerController.judgeCode);

export default router;
