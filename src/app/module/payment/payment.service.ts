import crypto from "crypto";
import httpStatus from "http-status";
import type { Prisma } from "../../../generated/prisma/client";
import { BillStatus, NotificationType, PaymentStatus } from "../../../generated/prisma/enums";
import type { PaymentWhereInput } from "../../../generated/prisma/models";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { createPaymentSession, validatePayment } from "../../lib/sslcommerz";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { createAuditLog } from "../../utils/auditLog";
import { notifyAdmins, notifyUser } from "../../utils/notification";
import { buildMeta, getSkip } from "../../utils/pagination";
import type { IMyPaymentsQuery, ISslCallbackBody } from "./payment.interface";

// A PENDING session younger than this is re-used instead of creating a new one
const SESSION_REUSE_MINUTES = 30;

// Where the customer's browser is sent after a callback
const frontendSuccessUrl = (tranId: string) =>
	`${config.frontend_url}/payment/success?tran_id=${encodeURIComponent(tranId)}`;
const frontendCancelUrl = (tranId: string, reason: string) =>
	`${config.frontend_url}/payment/cancel?tran_id=${encodeURIComponent(tranId)}&reason=${reason}`;

// e.g. "LS-1795262000000-9F3A1C"
const generateTransactionId = () =>
	`LS-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

// ======================= 1. INITIATE =======================
const initiatePayment = async (billId: string, customer: RequestUser) => {
	const bill = await prisma.bill.findUnique({
		where: { id: billId },
		include: { customer: true },
	});

	// Another customer's bill looks like "not found"
	if (!bill || bill.customerId !== customer.userId) {
		throw new AppError(httpStatus.NOT_FOUND, "Bill not found");
	}

	if (bill.status === BillStatus.PAID) {
		throw new AppError(httpStatus.CONFLICT, "This bill is already paid");
	}

	// Duplicate prevention: if a recent PENDING session exists, give back the
	// same payment page instead of opening a second payment for the same bill.
	const recentPending = await prisma.payment.findFirst({
		where: {
			billId,
			status: PaymentStatus.PENDING,
			createdAt: { gte: new Date(Date.now() - SESSION_REUSE_MINUTES * 60 * 1000) },
		},
		orderBy: { createdAt: "desc" },
	});

	const savedUrl = (recentPending?.gatewayResponse as { GatewayPageURL?: string } | null)?.GatewayPageURL;

	if (recentPending && savedUrl) {
		return {
			paymentId: recentPending.id,
			transactionId: recentPending.transactionId,
			amount: recentPending.amount,
			gatewayUrl: savedUrl,
			reused: true,
		};
	}

	// Old PENDING sessions are expired -> mark them FAILED
	await prisma.payment.updateMany({
		where: { billId, status: PaymentStatus.PENDING },
		data: { status: PaymentStatus.FAILED },
	});

	const transactionId = generateTransactionId();
	const amount = Number(bill.amount);

	// Save the attempt first, so every callback can find it by transactionId
	const payment = await prisma.payment.create({
		data: {
			transactionId,
			amount: bill.amount,
			billId: bill.id,
			customerId: customer.userId,
		},
	});

	try {
		const session = await createPaymentSession({
			transactionId,
			amount,
			productName: `Electricity bill ${bill.billMonth}`,
			customer: {
				name: bill.customer.name,
				email: bill.customer.email,
				phone: bill.customer.phone || "01700000000",
				address: bill.customer.address || "Dhaka",
			},
		});

		await prisma.payment.update({
			where: { id: payment.id },
			data: { gatewayResponse: { GatewayPageURL: session.GatewayPageURL, sessionkey: session.sessionkey } },
		});

		return { paymentId: payment.id, transactionId, amount, gatewayUrl: session.GatewayPageURL, reused: false };
	} catch (error) {
		// Could not reach SSLCommerz: this attempt is failed
		await prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
		throw error;
	}
};

// ======================= 2. SUCCESS / IPN =======================
// Used by BOTH the success callback and the IPN.
// The payment is marked SUCCESS only after SSLCommerz's validation API says it is valid.
const confirmPayment = async (body: ISslCallbackBody, source: "SUCCESS_CALLBACK" | "IPN") => {
	const tranId = body.tran_id ?? "";

	if (!body.val_id || !tranId) {
		return { ok: false, tranId, reason: "missing_data" };
	}

	const payment = await prisma.payment.findUnique({ where: { transactionId: tranId } });

	if (!payment) {
		return { ok: false, tranId, reason: "unknown_transaction" };
	}

	// Ask SSLCommerz (server to server). Never trust the browser's data.
	const validation = await validatePayment(body.val_id);

	const isValid = validation.status === "VALID" || validation.status === "VALIDATED";
	const sameTransaction = validation.tran_id === payment.transactionId;
	const sameAmount = Number(validation.amount).toFixed(2) === Number(payment.amount).toFixed(2);
	const sameCurrency = validation.currency === payment.currency;

	if (!isValid || !sameTransaction || !sameAmount || !sameCurrency) {
		await prisma.$transaction(async (tx) => {
			await createAuditLog(tx, {
				userId: null, // system
				action: "PAYMENT_VALIDATION_FAILED",
				entityType: "Payment",
				entityId: payment.id,
				details: {
					source,
					validationStatus: validation.status,
					sameTransaction,
					sameAmount,
					sameCurrency,
				},
			});
		});

		return { ok: false, tranId, reason: "validation_failed" };
	}

	const result = await prisma.$transaction(async (tx) => {
		// Duplicate prevention: only a payment that is not SUCCESS yet is updated.
		// If the success callback and the IPN both arrive, the second one changes nothing.
		const updated = await tx.payment.updateMany({
			where: { id: payment.id, status: { not: PaymentStatus.SUCCESS } },
			data: {
				status: PaymentStatus.SUCCESS,
				valId: body.val_id,
				bankTransactionId: validation.bank_tran_id,
				cardType: validation.card_type,
				gatewayResponse: validation as Prisma.InputJsonValue,
				paidAt: new Date(),
			},
		});

		if (updated.count === 0) {
			return { alreadyProcessed: true };
		}

		// Mark the bill PAID (only if it is still UNPAID)
		const billUpdate = await tx.bill.updateMany({
			where: { id: payment.billId, status: BillStatus.UNPAID },
			data: { status: BillStatus.PAID, paidAt: new Date() },
		});

		if (billUpdate.count === 0) {
			// Bill was already paid by another payment: customer paid twice -> admin must refund
			await notifyAdmins(tx, {
				title: "Duplicate payment - refund needed",
				message: `Transaction ${payment.transactionId} paid a bill that was already paid.`,
				type: NotificationType.PAYMENT,
			});
		}

		await notifyUser(tx, payment.customerId, {
			title: "Payment successful",
			message: `We received ${Number(payment.amount).toFixed(2)} BDT. Transaction: ${payment.transactionId}`,
			type: NotificationType.PAYMENT,
		});

		await createAuditLog(tx, {
			userId: null, // confirmed by SSLCommerz, not by a logged-in user
			action: billUpdate.count === 0 ? "DUPLICATE_PAYMENT_NEEDS_REFUND" : "PAYMENT_SUCCESS",
			entityType: "Payment",
			entityId: payment.id,
			details: { source, transactionId: payment.transactionId, billId: payment.billId, valId: body.val_id },
		});

		return { alreadyProcessed: false };
	});

	return { ok: true, tranId, alreadyProcessed: result.alreadyProcessed };
};

// ======================= 3. FAIL / CANCEL =======================
// Only a PENDING payment is changed. A payment that is already SUCCESS is never touched.
const closePayment = async (body: ISslCallbackBody, newStatus: "FAILED" | "CANCELLED") => {
	const tranId = body.tran_id ?? "";

	const payment = tranId ? await prisma.payment.findUnique({ where: { transactionId: tranId } }) : null;

	if (!payment) {
		return { tranId, changed: false };
	}

	const changed = await prisma.$transaction(async (tx) => {
		const updated = await tx.payment.updateMany({
			where: { id: payment.id, status: PaymentStatus.PENDING },
			data: { status: newStatus },
		});

		if (updated.count === 0) {
			return false;
		}

		await createAuditLog(tx, {
			userId: null,
			action: newStatus === "FAILED" ? "PAYMENT_FAILED" : "PAYMENT_CANCELLED",
			entityType: "Payment",
			entityId: payment.id,
			details: { transactionId: tranId, gatewayStatus: String(body.status ?? "") },
		});

		return true;
	});

	return { tranId, changed };
};

// ======================= Callback handlers (return a redirect URL) =======================
const handleSuccess = async (body: ISslCallbackBody) => {
	const result = await confirmPayment(body, "SUCCESS_CALLBACK");
	return result.ok ? frontendSuccessUrl(result.tranId) : frontendCancelUrl(result.tranId, result.reason ?? "failed");
};

const handleFail = async (body: ISslCallbackBody) => {
	const { tranId } = await closePayment(body, "FAILED");
	return frontendCancelUrl(tranId, "failed");
};

const handleCancel = async (body: ISslCallbackBody) => {
	const { tranId } = await closePayment(body, "CANCELLED");
	return frontendCancelUrl(tranId, "cancelled");
};

const handleIpn = async (body: ISslCallbackBody) => {
	// IPN may also report a failed / cancelled payment
	const gatewayStatus = String(body.status ?? "").toUpperCase();

	if (gatewayStatus === "FAILED") return { ...(await closePayment(body, "FAILED")), ok: false };
	if (gatewayStatus === "CANCELLED") return { ...(await closePayment(body, "CANCELLED")), ok: false };

	return confirmPayment(body, "IPN");
};

// ======================= 4. HISTORY =======================
const getMyPayments = async (customer: RequestUser, query: IMyPaymentsQuery) => {
	const { page, limit, status, transactionId } = query;

	const where: PaymentWhereInput = { customerId: customer.userId };
	if (status) where.status = status;
	if (transactionId) where.transactionId = transactionId;

	const [payments, total] = await Promise.all([
		prisma.payment.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				transactionId: true,
				amount: true,
				currency: true,
				status: true,
				bankTransactionId: true,
				cardType: true,
				paidAt: true,
				createdAt: true,
				bill: { select: { id: true, billMonth: true, amount: true, status: true } },
			},
		}),
		prisma.payment.count({ where }),
	]);

	return { data: payments, meta: buildMeta(page, limit, total) };
};

export const PaymentService = {
	initiatePayment,
	handleSuccess,
	handleFail,
	handleCancel,
	handleIpn,
	getMyPayments,
};
