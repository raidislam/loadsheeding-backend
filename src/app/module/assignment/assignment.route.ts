import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { IdParamZodSchema } from "../../utils/commonValidation";
import { AssignmentController } from "./assignment.controller";
import { AssignmentValidation } from "./assignment.validation";

// ---------- /api/v1/assignments ----------
const router = Router();

// Admin: assign a technician and monitor all jobs
router.post(
	"/",
	auth(Role.ADMIN),
	validateRequest(AssignmentValidation.CreateAssignmentZodSchema),
	AssignmentController.createAssignment,
);

router.get(
	"/",
	auth(Role.ADMIN),
	validateRequest(AssignmentValidation.AssignmentQueryZodSchema, "query"),
	AssignmentController.getAllAssignments,
);

// Admin, or the technician the job belongs to
router.get(
	"/:id",
	auth(Role.ADMIN, Role.TECHNICIAN),
	validateRequest(IdParamZodSchema, "params"),
	AssignmentController.getSingleAssignment,
);

// Admin: change the technician (only before work starts)
router.patch(
	"/:id/technician",
	auth(Role.ADMIN),
	validateRequest(IdParamZodSchema, "params"),
	validateRequest(AssignmentValidation.ReassignZodSchema),
	AssignmentController.reassignTechnician,
);

// Only the assigned technician
router.patch(
	"/:id/status",
	auth(Role.TECHNICIAN),
	validateRequest(IdParamZodSchema, "params"),
	validateRequest(AssignmentValidation.UpdateAssignmentStatusZodSchema),
	AssignmentController.updateAssignmentStatus,
);

router.post(
	"/:id/repair-report",
	auth(Role.TECHNICIAN),
	validateRequest(IdParamZodSchema, "params"),
	validateRequest(AssignmentValidation.RepairReportZodSchema),
	AssignmentController.submitRepairReport,
);

export const AssignmentRoutes = router;

// ---------- /api/v1/technicians ----------
const technicianRouter = Router();

technicianRouter.get(
	"/my-jobs",
	auth(Role.TECHNICIAN),
	validateRequest(AssignmentValidation.MyJobsQueryZodSchema, "query"),
	AssignmentController.getMyJobs,
);

technicianRouter.get(
	"/my-history",
	auth(Role.TECHNICIAN),
	validateRequest(AssignmentValidation.MyHistoryQueryZodSchema, "query"),
	AssignmentController.getMyHistory,
);

export const TechnicianRoutes = technicianRouter;
