import type { Request, Response } from "express";
import httpStatus from "http-status";
import config from "../../config";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IMyPaymentsQuery } from "./payment.interface";
import { PaymentService } from "./payment.service";

const initiatePayment = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentService.initiatePayment(req.body.billId, req.user!);

	sendResponse(res, {
		statusCode: result.reused ? httpStatus.OK : httpStatus.CREATED,
		message: result.reused
			? "A payment for this bill is already in progress. Continue with the same payment page."
			: "Payment session created. Redirect the customer to gatewayUrl.",
		data: result,
	});
});

// SSLCommerz sends the customer's BROWSER here with a form POST.
// So these routes answer with a redirect to the frontend, not with JSON.
// If something goes wrong, the customer still lands on the cancel page.
const redirectAfter = (handler: (body: any) => Promise<string>) => {
	return async (req: Request, res: Response) => {
		try {
			const url = await handler(req.body ?? {});
			res.redirect(httpStatus.SEE_OTHER, url);
		} catch (error) {
			console.error("Payment callback error:", error);
			res.redirect(httpStatus.SEE_OTHER, `${config.frontend_url}/payment/cancel?reason=error`);
		}
	};
};

const paymentSuccess = redirectAfter(PaymentService.handleSuccess);
const paymentFail = redirectAfter(PaymentService.handleFail);
const paymentCancel = redirectAfter(PaymentService.handleCancel);

// IPN is server-to-server (SSLCommerz -> us), so it gets a JSON answer
const paymentIpn = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentService.handleIpn(req.body ?? {});

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "IPN received",
		data: result,
	});
});

const getMyPayments = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await PaymentService.getMyPayments(req.user!, req.query as unknown as IMyPaymentsQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Your payments retrieved successfully",
		meta,
		data,
	});
});

export const PaymentController = {
	initiatePayment,
	paymentSuccess,
	paymentFail,
	paymentCancel,
	paymentIpn,
	getMyPayments,
};
