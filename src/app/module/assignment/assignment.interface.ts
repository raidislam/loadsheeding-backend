import type { AssignmentStatus } from "../../../generated/prisma/enums";

export interface ICreateAssignmentPayload {
	reportId: string;
	technicianId: string;
	note?: string;
}

// Technician moves the job forward. COMPLETED is set only by the repair report.
export interface IUpdateAssignmentStatusPayload {
	status: "ACCEPTED" | "IN_PROGRESS";
}

export interface IRepairReportPayload {
	workDescription: string;
	partsUsed?: string;
	restoredAt?: Date; // defaults to now
}

export interface IAssignmentQuery {
	page: number;
	limit: number;
	sortBy: "assignedAt" | "completedAt" | "status";
	sortOrder: "asc" | "desc";
	status?: AssignmentStatus;
	technicianId?: string;
	searchTerm?: string;
}

export interface IReassignPayload {
	technicianId: string;
}

export interface IMyJobsQuery {
	page: number;
	limit: number;
	status?: "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS";
}
