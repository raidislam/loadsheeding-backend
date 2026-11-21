import type { PaymentStatus } from "../../../generated/prisma/enums";

export interface IInitiatePaymentPayload {
	billId: string;
}

// Fields SSLCommerz POSTs to our success / fail / cancel / ipn URLs
export interface ISslCallbackBody {
	tran_id?: string;
	val_id?: string;
	status?: string;
	[key: string]: unknown;
}

export interface IMyPaymentsQuery {
	page: number;
	limit: number;
	status?: PaymentStatus;
	transactionId?: string;
}
