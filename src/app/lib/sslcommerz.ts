import httpStatus from "http-status";
import config from "../config";
import { AppError } from "../utils/AppError";

// SSLCommerz has two servers: sandbox (testing) and live (real money)
const BASE_URL = config.sslcommerz.is_live
	? "https://securepay.sslcommerz.com"
	: "https://sandbox.sslcommerz.com";

// Callback URLs: from .env, or built from BACKEND_URL
const callbackUrl = (customUrl: string, path: string) =>
	customUrl || `${config.backend_url}/api/v1/payments/${path}`;

export const sslcommerzUrls = {
	success: callbackUrl(config.sslcommerz.success_url, "success"),
	fail: callbackUrl(config.sslcommerz.fail_url, "fail"),
	cancel: callbackUrl(config.sslcommerz.cancel_url, "cancel"),
	ipn: callbackUrl(config.sslcommerz.ipn_url, "ipn"),
};

type TSessionData = {
	transactionId: string;
	amount: number;
	productName: string;
	customer: { name: string; email: string; phone: string; address: string };
};

// Step 1: create a payment session. SSLCommerz returns a GatewayPageURL
// where the customer enters card / bKash / Nagad details.
export const createPaymentSession = async (data: TSessionData) => {
	const body = new URLSearchParams({
		store_id: config.sslcommerz.store_id,
		store_passwd: config.sslcommerz.store_password,
		total_amount: data.amount.toFixed(2),
		currency: "BDT",
		tran_id: data.transactionId,
		success_url: sslcommerzUrls.success,
		fail_url: sslcommerzUrls.fail,
		cancel_url: sslcommerzUrls.cancel,
		ipn_url: sslcommerzUrls.ipn,
		product_name: data.productName,
		product_category: "Electricity Bill",
		product_profile: "non-physical-goods",
		shipping_method: "NO",
		cus_name: data.customer.name,
		cus_email: data.customer.email,
		cus_phone: data.customer.phone,
		cus_add1: data.customer.address,
		cus_city: "Dhaka",
		cus_country: "Bangladesh",
	});

	const response = await fetch(`${BASE_URL}/gwprocess/v4/api.php`, {
		method: "POST",
		body,
		signal: AbortSignal.timeout(20000),
	});

	const result = await response.json();

	if (result.status !== "SUCCESS" || !result.GatewayPageURL) {
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			`Could not start payment: ${result.failedreason || "SSLCommerz error"}`,
		);
	}

	return result as { status: string; GatewayPageURL: string; sessionkey: string };
};

// Step 2: ask SSLCommerz if a payment is really valid.
// We NEVER trust the data the browser sends to our success URL.
export const validatePayment = async (valId: string) => {
	const params = new URLSearchParams({
		val_id: valId,
		store_id: config.sslcommerz.store_id,
		store_passwd: config.sslcommerz.store_password,
		format: "json",
	});

	const response = await fetch(`${BASE_URL}/validator/api/validationserverAPI.php?${params}`, {
		signal: AbortSignal.timeout(20000),
	});

	// status is "VALID" / "VALIDATED" for a real payment, "INVALID_TRANSACTION" otherwise
	return (await response.json()) as {
		status: string;
		tran_id?: string;
		val_id?: string;
		amount?: string;
		currency?: string;
		bank_tran_id?: string;
		card_type?: string;
		[key: string]: unknown;
	};
};
