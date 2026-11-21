import { z } from "zod";
import { PaymentStatus } from "../../../generated/prisma/enums";
import { paginationQueryFields } from "../../utils/commonValidation";

const InitiatePaymentZodSchema = z.object({
	billId: z.uuid("Invalid billId"),
});

const MyPaymentsQueryZodSchema = z.object({
	page: paginationQueryFields.page,
	limit: paginationQueryFields.limit,
	status: z.enum(PaymentStatus, "Invalid status").optional(),
	transactionId: z.string().trim().min(5).max(64).optional(),
});

export const PaymentValidation = {
	InitiatePaymentZodSchema,
	MyPaymentsQueryZodSchema,
};
