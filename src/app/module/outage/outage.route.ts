import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { IdParamZodSchema } from "../../utils/commonValidation";
import { OutageController } from "./outage.controller";
import { OutageValidation } from "./outage.validation";

const router = Router();

// Public (used by the /outage-status page)
router.get("/", validateRequest(OutageValidation.OutageQueryZodSchema, "query"), OutageController.getAllOutages);

// "/search" must come BEFORE "/:id", otherwise "search" would be read as an id
router.get(
	"/search",
	validateRequest(OutageValidation.OutageSearchZodSchema, "query"),
	OutageController.searchOutages,
);

router.get("/:id", validateRequest(IdParamZodSchema, "params"), OutageController.getSingleOutage);

// Admin only
router.post(
	"/",
	auth(Role.ADMIN),
	validateRequest(OutageValidation.CreateOutageZodSchema),
	OutageController.createOutage,
);

router.patch(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(IdParamZodSchema, "params"),
	validateRequest(OutageValidation.UpdateOutageZodSchema),
	OutageController.updateOutage,
);

router.delete(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(IdParamZodSchema, "params"),
	OutageController.deleteOutage,
);

export const OutageRoutes = router;
