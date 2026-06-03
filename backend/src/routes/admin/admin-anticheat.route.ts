import { Router } from 'express';
import { AdminAnticheatController } from '../../controllers/admin/admin-anticheat.controller';

const router = Router();

router.get('/logs', AdminAnticheatController.getAlertLogs);
router.get('/logs/:studentID', AdminAnticheatController.getAlertLogsByStudentId);
router.put('/status', AdminAnticheatController.setAlertOkStatus);

export default router;
