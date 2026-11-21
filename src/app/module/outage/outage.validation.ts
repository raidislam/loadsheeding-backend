import { z } from "zod";
import { OutageStatus, OutageType } from "../../../generated/prisma/enums";
import { paginationQueryFields } from "../../utils/commonValidation";

// Accepts an ISO date string like "2026-11-25T14:00:00+06:00"
const dateField = (label: string) => z.coerce.date(`${label} must be a valid date`);

const CreateOutageZodSchema = z
	.object({
		title: z.string("Title is required").trim().min(3, "Title must be at least 3 characters").max(150),
		type: z.enum(OutageType, "type must be SCHEDULED or UNEXPECTED").default(OutageType.SCHEDULED),
		areaId: z.uuid("Invalid areaId"),
		startTime: dateField("startTime"),
		expectedRestoreTime: dateField("expectedRestoreTime"),
		reason: z.string("Reason is required").trim().min(3, "Reason must be at least 3 characters").max(255),
		description: z.string().trim().max(1000).optional(),
	})
	.refine((data) => data.expectedRestoreTime > data.startTime, {
		message: "expectedRestoreTime must be after startTime",
		path: ["expectedRestoreTime"],
	})
	.refine((data) => data.type !== OutageType.SCHEDULED || data.startTime > new Date(), {
		message: "A scheduled outage must start in the future",
		path: ["startTime"],
	});

// The area and type can't be changed after creation (create a new outage instead).
const UpdateOutageZodSchema = z
	.object({
		title: z.string().trim().min(3, "Title must be at least 3 characters").max(150).optional(),
		reason: z.string().trim().min(3, "Reason must be at least 3 characters").max(255).optional(),
		description: z.string().trim().max(1000).optional(),
		startTime: dateField("startTime").optional(),
		expectedRestoreTime: dateField("expectedRestoreTime").optional(),
		status: z.enum(OutageStatus, "Invalid status").optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "Provide at least one field to update",
	});

const OutageQueryZodSchema = z
	.object({
		page: paginationQueryFields.page,
		limit: paginationQueryFields.limit,
		sortOrder: paginationQueryFields.sortOrder,
		sortBy: z.enum(["startTime", "expectedRestoreTime", "createdAt", "status"]).default("startTime"),
		status: z.enum(OutageStatus, "Invalid status").optional(),
		type: z.enum(OutageType, "Invalid type").optional(),
		areaId: z.uuid("Invalid areaId").optional(),
		feederId: z.uuid("Invalid feederId").optional(),
		substationId: z.uuid("Invalid substationId").optional(),
		zoneId: z.uuid("Invalid zoneId").optional(),
		from: dateField("from").optional(), // startTime >= from
		to: dateField("to").optional(), // startTime <= to
	})
	.refine((data) => !data.from || !data.to || data.from <= data.to, {
		message: "'from' must be before 'to'",
		path: ["from"],
	});

const OutageSearchZodSchema = z.object({
	q: z.string("Search text 'q' is required").trim().min(2, "Search text must be at least 2 characters"),
	page: paginationQueryFields.page,
	limit: paginationQueryFields.limit,
});

export const OutageValidation = {
	CreateOutageZodSchema,
	UpdateOutageZodSchema,
	OutageQueryZodSchema,
	OutageSearchZodSchema,
};
