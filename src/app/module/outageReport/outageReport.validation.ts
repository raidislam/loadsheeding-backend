import { z } from "zod";
import { ReportStatus } from "../../../generated/prisma/enums";
import { paginationQueryFields } from "../../utils/commonValidation";

const CreateReportZodSchema = z.object({
	title: z.string("Title is required").trim().min(5, "Title must be at least 5 characters").max(150),
	description: z
		.string("Description is required")
		.trim()
		.min(10, "Description must be at least 10 characters")
		.max(1000, "Description cannot exceed 1000 characters"),
	address: z.string().trim().min(3, "Address is too short").max(255).optional(),
	areaId: z.uuid("Invalid areaId").optional(),
});

const ReviewReportZodSchema = z
	.object({
		status: z.enum(["UNDER_REVIEW", "REJECTED"], "status must be UNDER_REVIEW or REJECTED"),
		adminNote: z.string().trim().min(3, "Admin note is too short").max(500).optional(),
		outageId: z.uuid("Invalid outageId").optional(),
	})
	.refine((data) => data.status !== "REJECTED" || !!data.adminNote, {
		message: "adminNote (rejection reason) is required when rejecting a report",
		path: ["adminNote"],
	});

const MyReportsQueryZodSchema = z.object({
	page: paginationQueryFields.page,
	limit: paginationQueryFields.limit,
	sortOrder: paginationQueryFields.sortOrder,
	sortBy: z.enum(["createdAt", "updatedAt", "status"]).default("createdAt"),
	status: z.enum(ReportStatus, "Invalid status").optional(),
});

const AllReportsQueryZodSchema = MyReportsQueryZodSchema.extend({
	searchTerm: paginationQueryFields.searchTerm,
	areaId: z.uuid("Invalid areaId").optional(),
	zoneId: z.uuid("Invalid zoneId").optional(),
	customerId: z.uuid("Invalid customerId").optional(),
});

export const OutageReportValidation = {
	CreateReportZodSchema,
	ReviewReportZodSchema,
	MyReportsQueryZodSchema,
	AllReportsQueryZodSchema,
};
