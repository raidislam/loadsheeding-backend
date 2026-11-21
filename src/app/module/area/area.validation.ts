import { z } from "zod";
import { paginationQueryFields } from "../../utils/commonValidation";
import { codeField } from "../zone/zone.validation";

const CreateAreaZodSchema = z.object({
	name: z.string("Name is required").trim().min(2, "Name must be at least 2 characters").max(100),
	code: codeField,
	feederId: z.uuid("Invalid feederId"),
});

const UpdateAreaZodSchema = CreateAreaZodSchema.partial().refine(
	(data) => Object.keys(data).length > 0,
	{ message: "Provide at least one field to update" },
);

const AreaQueryZodSchema = z.object({
	...paginationQueryFields,
	sortBy: z.enum(["name", "code", "createdAt"]).default("createdAt"),
	feederId: z.uuid("Invalid feederId").optional(),
	substationId: z.uuid("Invalid substationId").optional(),
	zoneId: z.uuid("Invalid zoneId").optional(),
});

export const AreaValidation = {
	CreateAreaZodSchema,
	UpdateAreaZodSchema,
	AreaQueryZodSchema,
};
