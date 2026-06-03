import { Router } from 'express';
import { UserSubmissionController } from '../../controllers/user/user-submission.controller';
import { decryptAndVerifyDeviceSession } from '../../middlewares/user-crypto.middleware';
import { createActionLog } from '../../middlewares/action-log.middleware';

const router = Router();

router.post('/code', decryptAndVerifyDeviceSession, createActionLog('SUBMIT_CODE'), UserSubmissionController.submitCode);

export default router;
