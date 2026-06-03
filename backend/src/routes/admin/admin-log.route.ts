import { Router } from 'express';
import { AdminLogController } from '../../controllers/admin/admin-log.controller';

const router = Router();

router.get('/', AdminLogController.getLogs);
router.get('/:testId', AdminLogController.getLogsByTestId);

export default router;
