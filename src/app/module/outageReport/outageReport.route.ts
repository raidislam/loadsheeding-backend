import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { IdParamZodSchema } from "../../utils/commonValidation";
import { OutageReportController } from "./outageReport.controller";
import { OutageReportValidation } from "./outageReport.validation";

const router = Router();

// Customer: submit and track own reports
router.post(
	"/",
	auth(Role.CUSTOMER),
	validateRequest(OutageReportValidation.CreateReportZodSchema),
	OutageReportController.createReport,
);

// "/my-reports" must come BEFORE "/:id"
router.get(
	"/my-reports",
	auth(Role.CUSTOMER),
	validateRequest(OutageReportValidation.MyReportsQueryZodSchema, "query"),
	OutageReportController.getMyReports,
);

// Admin: all reports
router.get(
	"/",
	auth(Role.ADMIN),
	validateRequest(OutageReportValidation.AllReportsQueryZodSchema, "query"),
	OutageReportController.getAllReports,
);

// Admin, or the customer who owns the report
router.get(
	"/:id",
	auth(Role.ADMIN, Role.CUSTOMER),
	validateRequest(IdParamZodSchema, "params"),
	OutageReportController.getSingleReport,
);

// Admin review
router.patch(
	"/:id/status",
	auth(Role.ADMIN),
	validateRequest(IdParamZodSchema, "params"),
	validateRequest(OutageReportValidation.ReviewReportZodSchema),
	OutageReportController.reviewReport,
);

export const OutageReportRoutes = router;
