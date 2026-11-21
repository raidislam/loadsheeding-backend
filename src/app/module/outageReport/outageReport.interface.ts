import type { ReportStatus } from "../../../generated/prisma/enums";

export interface ICreateReportPayload {
	title: string;
	description: string;
	address?: string;
	areaId?: string; // if not sent, the customer's own area is used
}

// Admin review. Only these two statuses are set here;
// ASSIGNED / IN_PROGRESS / RESOLVED are set by the technician workflow.
export interface IReviewReportPayload {
	status: "UNDER_REVIEW" | "REJECTED";
	adminNote?: string;
	outageId?: string; // optionally link the report to an outage
}

export interface IMyReportsQuery {
	page: number;
	limit: number;
	sortBy: "createdAt" | "updatedAt" | "status";
	sortOrder: "asc" | "desc";
	status?: ReportStatus;
}

export interface IAllReportsQuery extends IMyReportsQuery {
	searchTerm?: string;
	areaId?: string;
	zoneId?: string;
	customerId?: string;
}
