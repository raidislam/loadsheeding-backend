import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { BillController } from "./bill.controller";
import { BillValidation } from "./bill.validation";

const router = Router();

router.post("/", auth(Role.ADMIN), validateRequest(BillValidation.CreateBillZodSchema), BillController.createBill);

router.get(
	"/my-bills",
	auth(Role.CUSTOMER),
	validateRequest(BillValidation.MyBillsQueryZodSchema, "query"),
	BillController.getMyBills,
);

router.get(
	"/",
	auth(Role.ADMIN),
	validateRequest(BillValidation.AllBillsQueryZodSchema, "query"),
	BillController.getAllBills,
);

export const BillRoutes = router;
