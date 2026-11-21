import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { IdParamZodSchema } from "../../utils/commonValidation";
import { FeederController } from "./feeder.controller";
import { FeederValidation } from "./feeder.validation";

const router = Router();

// Public
router.get("/", validateRequest(FeederValidation.FeederQueryZodSchema, "query"), FeederController.getAllFeeders);
router.get("/:id", validateRequest(IdParamZodSchema, "params"), FeederController.getSingleFeeder);

// Admin only
router.post(
	"/",
	auth(Role.ADMIN),
	validateRequest(FeederValidation.CreateFeederZodSchema),
	FeederController.createFeeder,
);

router.patch(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(IdParamZodSchema, "params"),
	validateRequest(FeederValidation.UpdateFeederZodSchema),
	FeederController.updateFeeder,
);

router.delete(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(IdParamZodSchema, "params"),
	FeederController.deleteFeeder,
);

export const FeederRoutes = router;
