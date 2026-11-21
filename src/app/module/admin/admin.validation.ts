import { z } from "zod";
import { Role, UserStatus } from "../../../generated/prisma/enums";
import { paginationQueryFields } from "../../utils/commonValidation";
import { emailField, passwordField, phoneField } from "../auth/auth.validation";

const CreateTechnicianZodSchema = z.object({
	name: z.string("Name is required").trim().min(2, "Name must be at least 2 characters").max(100),
	email: emailField,
	password: passwordField, // initial password, given to the technician by the admin
	phone: phoneField.optional(),
	address: z.string().trim().min(3, "Address is too short").max(255).optional(),
});

const ChangeRoleZodSchema = z.object({
	role: z.enum(Role, "role must be ADMIN, CUSTOMER or TECHNICIAN"),
});

const ChangeStatusZodSchema = z.object({
	status: z.enum(UserStatus, "status must be ACTIVE or BLOCKED"),
});

const UsersQueryZodSchema = z.object({
	...paginationQueryFields,
	sortBy: z.enum(["createdAt", "name", "email"], "sortBy must be createdAt, name or email").default("createdAt"),
	role: z.enum(Role, "Invalid role").optional(),
	status: z.enum(UserStatus, "Invalid status").optional(),
	areaId: z.uuid("Invalid areaId").optional(),
});

const AuditLogQueryZodSchema = z
	.object({
		page: paginationQueryFields.page,
		limit: paginationQueryFields.limit,
		sortOrder: paginationQueryFields.sortOrder,
		action: z.string().trim().toUpperCase().max(64).optional(), // e.g. OUTAGE_CREATED
		entityType: z.string().trim().max(64).optional(), // e.g. Outage
		entityId: z.string().trim().max(64).optional(),
		userId: z.uuid("Invalid userId").optional(),
		from: z.coerce.date("from must be a valid date").optional(),
		to: z.coerce.date("to must be a valid date").optional(),
	})
	.refine((data) => !data.from || !data.to || data.from <= data.to, {
		message: "'from' must be before 'to'",
		path: ["from"],
	});

export const AdminValidation = {
	CreateTechnicianZodSchema,
	ChangeRoleZodSchema,
	ChangeStatusZodSchema,
	UsersQueryZodSchema,
	AuditLogQueryZodSchema,
};
