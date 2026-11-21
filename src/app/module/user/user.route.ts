import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { UserController } from "./user.controller";
import { UserValidation } from "./user.validation";

const router = Router();

// All three roles (ADMIN, CUSTOMER, TECHNICIAN) can manage their own profile
router.get("/me", auth(), UserController.getMyProfile);

router.patch(
	"/me",
	auth(),
	validateRequest(UserValidation.UpdateMyProfileZodSchema),
	UserController.updateMyProfile,
);

router.patch(
	"/me/change-password",
	auth(),
	validateRequest(UserValidation.ChangePasswordZodSchema),
	UserController.changePassword,
);

export const UserRoutes = router;
