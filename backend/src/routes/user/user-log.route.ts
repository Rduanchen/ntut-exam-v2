import { Router } from 'express';
import { UserLogController } from '../../controllers/user/user-log.controller';
import { decryptAndVerifyDeviceSession } from '../../middlewares/user-crypto.middleware';

const router = Router();

// Endpoint for client pushing logs
router.post('/', decryptAndVerifyDeviceSession, UserLogController.logClientAction);

export default router;
