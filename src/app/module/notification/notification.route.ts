import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { IdParamZodSchema } from "../../utils/commonValidation";
import { NotificationController } from "./notification.controller";
import { NotificationValidation } from "./notification.validation";

const router = Router();

// auth() with no roles = ADMIN, CUSTOMER and TECHNICIAN can all use these.
// Each user only ever sees / changes their own notifications.

router.get(
	"/",
	auth(),
	validateRequest(NotificationValidation.NotificationQueryZodSchema, "query"),
	NotificationController.getMyNotifications,
);

router.patch("/read-all", auth(), NotificationController.markAllAsRead);

router.patch(
	"/:id/read",
	auth(),
	validateRequest(IdParamZodSchema, "params"),
	NotificationController.markAsRead,
);

export const NotificationRoutes = router;
