import { Router } from 'express';
import { AdminSubmissionController } from '../../controllers/admin/admin-submission.controller';

const router = Router();

// Retrieve a list of all submitted students
router.get("/students", AdminSubmissionController.getSubmittedStudents);

// Retrieve code details for a student
router.get('/:testId/code', AdminSubmissionController.getStudentCode);
router.get('/:testId/list', AdminSubmissionController.getSubmittedList);
router.get('/:testId/export', AdminSubmissionController.exportStudentCodeZip);

export default router;
