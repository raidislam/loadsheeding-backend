import { z } from "zod";
import { paginationQueryFields } from "../../utils/commonValidation";

// Codes are stored in UPPERCASE, e.g. "dhk-n" -> "DHK-N"
export const codeField = z
	.string("Code is required")
	.trim()
	.toUpperCase()
	.regex(/^[A-Z0-9-]{2,20}$/, "Code must be 2-20 characters: letters, numbers or '-'");

const CreateZoneZodSchema = z.object({
	name: z.string("Name is required").trim().min(2, "Name must be at least 2 characters").max(100),
	code: codeField,
	description: z.string().trim().max(500, "Description cannot exceed 500 characters").optional(),
});

const UpdateZoneZodSchema = CreateZoneZodSchema.partial().refine(
	(data) => Object.keys(data).length > 0,
	{ message: "Provide at least one field to update" },
);

const ZoneQueryZodSchema = z.object({
	...paginationQueryFields,
	sortBy: z.enum(["name", "code", "createdAt"], "sortBy must be name, code or createdAt").default("createdAt"),
});

export const ZoneValidation = {
	CreateZoneZodSchema,
	UpdateZoneZodSchema,
	ZoneQueryZodSchema,
};
