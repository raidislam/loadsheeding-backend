import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { IdParamZodSchema } from "../../utils/commonValidation";
import { ZoneController } from "./zone.controller";
import { ZoneValidation } from "./zone.validation";

const router = Router();

// Public: anyone can view zones
router.get("/", validateRequest(ZoneValidation.ZoneQueryZodSchema, "query"), ZoneController.getAllZones);
router.get("/:id", validateRequest(IdParamZodSchema, "params"), ZoneController.getSingleZone);

// Admin only
router.post(
	"/",
	auth(Role.ADMIN),
	validateRequest(ZoneValidation.CreateZoneZodSchema),
	ZoneController.createZone,
);

router.patch(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(IdParamZodSchema, "params"),
	validateRequest(ZoneValidation.UpdateZoneZodSchema),
	ZoneController.updateZone,
);

router.delete(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(IdParamZodSchema, "params"),
	ZoneController.deleteZone,
);

export const ZoneRoutes = router;
