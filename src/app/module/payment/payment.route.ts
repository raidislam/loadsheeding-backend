import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { PaymentController } from "./payment.controller";
import { PaymentValidation } from "./payment.validation";

const router = Router();

// Customer starts a payment for one of their bills
router.post(
	"/initiate",
	auth(Role.CUSTOMER),
	validateRequest(PaymentValidation.InitiatePaymentZodSchema),
	PaymentController.initiatePayment,
);

// Called by SSLCommerz (no login token). These are safe without auth because
// a payment is only marked SUCCESS after we verify it with SSLCommerz.
router.post("/success", PaymentController.paymentSuccess);
router.post("/fail", PaymentController.paymentFail);
router.post("/cancel", PaymentController.paymentCancel);
router.post("/ipn", PaymentController.paymentIpn);

router.get(
	"/my-payments",
	auth(Role.CUSTOMER),
	validateRequest(PaymentValidation.MyPaymentsQueryZodSchema, "query"),
	PaymentController.getMyPayments,
);

export const PaymentRoutes = router;
