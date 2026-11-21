import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { authLimiter } from "../../middleware/rateLimiter";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { AuthValidation } from "./auth.validation";

const router = Router();

router.post(
	"/register",
	authLimiter,
	validateRequest(AuthValidation.RegisterZodSchema),
	AuthController.register,
);

router.post(
	"/login",
	authLimiter,
	validateRequest(AuthValidation.LoginZodSchema),
	AuthController.login,
);

router.post(
	"/refresh-token",
	validateRequest(AuthValidation.RefreshTokenZodSchema),
	AuthController.refreshToken,
);

// Any logged-in user can log out
router.post("/logout", auth(), AuthController.logout);

export const AuthRoutes = router;
