import { Router } from 'express';
import { UserSubmissionController } from '../../controllers/user/user-submission.controller';
import { decryptAndVerifyDeviceSession } from '../../middlewares/user-crypto.middleware';
import { createActionLog } from '../../middlewares/action-log.middleware';

const router = Router();

router.post('/code', decryptAndVerifyDeviceSession, createActionLog('SUBMIT_CODE'), UserSubmissionController.submitCode);
router.post('/score', decryptAndVerifyDeviceSession, createActionLog('SUBMIT_SCORE'), UserSubmissionController.submitScore);
router.get('/codes', decryptAndVerifyDeviceSession, UserSubmissionController.getMySubmissions);

export default router;
