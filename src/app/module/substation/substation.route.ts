import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { IdParamZodSchema } from "../../utils/commonValidation";
import { SubstationController } from "./substation.controller";
import { SubstationValidation } from "./substation.validation";

const router = Router();

// Public
router.get(
	"/",
	validateRequest(SubstationValidation.SubstationQueryZodSchema, "query"),
	SubstationController.getAllSubstations,
);
router.get("/:id", validateRequest(IdParamZodSchema, "params"), SubstationController.getSingleSubstation);

// Admin only
router.post(
	"/",
	auth(Role.ADMIN),
	validateRequest(SubstationValidation.CreateSubstationZodSchema),
	SubstationController.createSubstation,
);

router.patch(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(IdParamZodSchema, "params"),
	validateRequest(SubstationValidation.UpdateSubstationZodSchema),
	SubstationController.updateSubstation,
);

router.delete(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(IdParamZodSchema, "params"),
	SubstationController.deleteSubstation,
);

export const SubstationRoutes = router;
