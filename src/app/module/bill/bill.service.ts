import httpStatus from "http-status";
import { NotificationType, Role } from "../../../generated/prisma/enums";
import type { BillWhereInput } from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { createAuditLog } from "../../utils/auditLog";
import { formatDhakaTime, notifyUser } from "../../utils/notification";
import { buildMeta, getSkip } from "../../utils/pagination";
import type { IAllBillsQuery, ICreateBillPayload, IMyBillsQuery } from "./bill.interface";

const createBill = async (payload: ICreateBillPayload, admin: RequestUser) => {
	const customer = await prisma.user.findFirst({
		where: { id: payload.customerId, deletedAt: null },
	});

	if (!customer || customer.role !== Role.CUSTOMER) {
		throw new AppError(httpStatus.NOT_FOUND, "Customer not found");
	}

	// One bill per customer per month (also a unique index in the DB)
	const existing = await prisma.bill.findUnique({
		where: { customerId_billMonth: { customerId: customer.id, billMonth: payload.billMonth } },
	});

	if (existing) {
		throw new AppError(httpStatus.CONFLICT, `A bill for ${payload.billMonth} already exists for this customer`);
	}

	return prisma.$transaction(async (tx) => {
		const bill = await tx.bill.create({ data: payload });

		await notifyUser(tx, customer.id, {
			title: `New electricity bill - ${payload.billMonth}`,
			message: `Your bill for ${payload.billMonth} is ${payload.amount.toFixed(2)} BDT (${payload.unitsConsumed} units). Due: ${formatDhakaTime(payload.dueDate)}.`,
			type: NotificationType.PAYMENT,
		});

		await createAuditLog(tx, {
			userId: admin.userId,
			action: "BILL_CREATED",
			entityType: "Bill",
			entityId: bill.id,
			details: { customerId: customer.id, billMonth: bill.billMonth, amount: payload.amount },
		});

		return bill;
	});
};

const getMyBills = async (customer: RequestUser, query: IMyBillsQuery) => {
	const { page, limit, status } = query;

	const where: BillWhereInput = { customerId: customer.userId };
	if (status) where.status = status;

	const [bills, total] = await Promise.all([
		prisma.bill.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { billMonth: "desc" },
		}),
		prisma.bill.count({ where }),
	]);

	return { data: bills, meta: buildMeta(page, limit, total) };
};

const getAllBills = async (query: IAllBillsQuery) => {
	const { page, limit, status, customerId, billMonth, searchTerm } = query;

	const where: BillWhereInput = {};
	if (status) where.status = status;
	if (customerId) where.customerId = customerId;
	if (billMonth) where.billMonth = billMonth;

	// Search by customer name / email / meter number
	if (searchTerm) {
		const contains = { contains: searchTerm, mode: "insensitive" as const };
		where.customer = {
			OR: [{ name: contains }, { email: contains }, { meterNumber: contains }],
		};
	}

	const [bills, total] = await Promise.all([
		prisma.bill.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { createdAt: "desc" },
			include: { customer: { select: { id: true, name: true, email: true, meterNumber: true } } },
		}),
		prisma.bill.count({ where }),
	]);

	return { data: bills, meta: buildMeta(page, limit, total) };
};

export const BillService = {
	createBill,
	getMyBills,
	getAllBills,
};
