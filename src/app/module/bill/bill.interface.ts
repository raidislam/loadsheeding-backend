import type { BillStatus } from "../../../generated/prisma/enums";

export interface ICreateBillPayload {
	customerId: string;
	billMonth: string; // "YYYY-MM"
	unitsConsumed: number;
	amount: number;
	dueDate: Date;
}

export interface IMyBillsQuery {
	page: number;
	limit: number;
	status?: BillStatus;
}

export interface IAllBillsQuery extends IMyBillsQuery {
	customerId?: string;
	billMonth?: string;
	searchTerm?: string;
}
