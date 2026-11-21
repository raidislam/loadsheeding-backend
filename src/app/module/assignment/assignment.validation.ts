import { z } from "zod";
import { AssignmentStatus } from "../../../generated/prisma/enums";
import { paginationQueryFields } from "../../utils/commonValidation";

const CreateAssignmentZodSchema = z.object({
	reportId: z.uuid("Invalid reportId"),
	technicianId: z.uuid("Invalid technicianId"),
	note: z.string().trim().max(500, "Note cannot exceed 500 characters").optional(),
});

const UpdateAssignmentStatusZodSchema = z.object({
	status: z.enum(
		["ACCEPTED", "IN_PROGRESS"],
		"status must be ACCEPTED or IN_PROGRESS (use the repair-report endpoint to complete a job)",
	),
});

const RepairReportZodSchema = z.object({
	workDescription: z
		.string("workDescription is required")
		.trim()
		.min(10, "workDescription must be at least 10 characters")
		.max(2000),
	partsUsed: z.string().trim().max(500).optional(),
	restoredAt: z.coerce
		.date("restoredAt must be a valid date")
		.refine((date) => date <= new Date(), "restoredAt can't be in the future")
		.optional(),
});

const AssignmentQueryZodSchema = z.object({
	page: paginationQueryFields.page,
	limit: paginationQueryFields.limit,
	sortOrder: paginationQueryFields.sortOrder,
	sortBy: z.enum(["assignedAt", "completedAt", "status"]).default("assignedAt"),
	status: z.enum(AssignmentStatus, "Invalid status").optional(),
	technicianId: z.uuid("Invalid technicianId").optional(),
	searchTerm: paginationQueryFields.searchTerm,
});

const ReassignZodSchema = z.object({
	technicianId: z.uuid("Invalid technicianId"),
});

const MyJobsQueryZodSchema = z.object({
	page: paginationQueryFields.page,
	limit: paginationQueryFields.limit,
	status: z.enum(["ASSIGNED", "ACCEPTED", "IN_PROGRESS"], "Invalid status").optional(),
});

const MyHistoryQueryZodSchema = z.object({
	page: paginationQueryFields.page,
	limit: paginationQueryFields.limit,
});

export const AssignmentValidation = {
	CreateAssignmentZodSchema,
	ReassignZodSchema,
	UpdateAssignmentStatusZodSchema,
	RepairReportZodSchema,
	AssignmentQueryZodSchema,
	MyJobsQueryZodSchema,
	MyHistoryQueryZodSchema,
};
