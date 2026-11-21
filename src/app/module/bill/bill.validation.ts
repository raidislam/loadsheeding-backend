import { z } from "zod";
import { BillStatus } from "../../../generated/prisma/enums";
import { paginationQueryFields } from "../../utils/commonValidation";

const billMonthField = z
	.string("billMonth is required")
	.regex(/^\d{4}-(0[1-9]|1[0-2])$/, "billMonth must be in YYYY-MM format, e.g. 2026-11");

const CreateBillZodSchema = z.object({
	customerId: z.uuid("Invalid customerId"),
	billMonth: billMonthField,
	unitsConsumed: z.number("unitsConsumed must be a number").int("unitsConsumed must be a whole number").min(0),
	amount: z
		.number("amount must be a number")
		.min(10, "amount must be at least 10 BDT") // SSLCommerz minimum is 10 BDT
		.max(500000, "amount is too large")
		.refine((value) => Number.isInteger(value * 100), "amount can have at most 2 decimal places"),
	dueDate: z.coerce.date("dueDate must be a valid date"),
});

const MyBillsQueryZodSchema = z.object({
	page: paginationQueryFields.page,
	limit: paginationQueryFields.limit,
	status: z.enum(BillStatus, "status must be UNPAID or PAID").optional(),
});

const AllBillsQueryZodSchema = MyBillsQueryZodSchema.extend({
	customerId: z.uuid("Invalid customerId").optional(),
	billMonth: billMonthField.optional(),
	searchTerm: paginationQueryFields.searchTerm,
});

export const BillValidation = {
	CreateBillZodSchema,
	MyBillsQueryZodSchema,
	AllBillsQueryZodSchema,
};
