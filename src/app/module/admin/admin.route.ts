import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { IdParamZodSchema } from "../../utils/commonValidation";
import { AdminController } from "./admin.controller";
import { AdminValidation } from "./admin.validation";

const router = Router();

// Every route in this file is ADMIN only
router.use(auth(Role.ADMIN));

router.get("/dashboard-stats", AdminController.getDashboardStats);

router.get("/users", validateRequest(AdminValidation.UsersQueryZodSchema, "query"), AdminController.getAllUsers);

router.post(
	"/users/technicians",
	validateRequest(AdminValidation.CreateTechnicianZodSchema),
	AdminController.createTechnician,
);

router.patch(
	"/users/:id/role",
	validateRequest(IdParamZodSchema, "params"),
	validateRequest(AdminValidation.ChangeRoleZodSchema),
	AdminController.changeRole,
);

router.patch(
	"/users/:id/block",
	validateRequest(IdParamZodSchema, "params"),
	validateRequest(AdminValidation.ChangeStatusZodSchema),
	AdminController.changeStatus,
);

router.get(
	"/audit-logs",
	validateRequest(AdminValidation.AuditLogQueryZodSchema, "query"),
	AdminController.getAuditLogs,
);

export const AdminRoutes = router;
