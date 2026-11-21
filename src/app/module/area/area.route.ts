import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { IdParamZodSchema } from "../../utils/commonValidation";
import { AreaController } from "./area.controller";
import { AreaValidation } from "./area.validation";

const router = Router();

// Public (also used by the register form's area dropdown)
router.get("/", validateRequest(AreaValidation.AreaQueryZodSchema, "query"), AreaController.getAllAreas);
router.get("/:id", validateRequest(IdParamZodSchema, "params"), AreaController.getSingleArea);

// Admin only
router.post(
	"/",
	auth(Role.ADMIN),
	validateRequest(AreaValidation.CreateAreaZodSchema),
	AreaController.createArea,
);

router.patch(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(IdParamZodSchema, "params"),
	validateRequest(AreaValidation.UpdateAreaZodSchema),
	AreaController.updateArea,
);

router.delete(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(IdParamZodSchema, "params"),
	AreaController.deleteArea,
);

export const AreaRoutes = router;
