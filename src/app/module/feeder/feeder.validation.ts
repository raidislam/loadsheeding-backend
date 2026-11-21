import { z } from "zod";
import { paginationQueryFields } from "../../utils/commonValidation";
import { codeField } from "../zone/zone.validation";

const CreateFeederZodSchema = z.object({
	name: z.string("Name is required").trim().min(2, "Name must be at least 2 characters").max(100),
	code: codeField,
	substationId: z.uuid("Invalid substationId"),
	voltageKV: z.number("voltageKV must be a number").positive("voltageKV must be greater than 0").optional(),
});

const UpdateFeederZodSchema = CreateFeederZodSchema.partial().refine(
	(data) => Object.keys(data).length > 0,
	{ message: "Provide at least one field to update" },
);

const FeederQueryZodSchema = z.object({
	...paginationQueryFields,
	sortBy: z.enum(["name", "code", "createdAt"]).default("createdAt"),
	substationId: z.uuid("Invalid substationId").optional(),
	zoneId: z.uuid("Invalid zoneId").optional(),
});

export const FeederValidation = {
	CreateFeederZodSchema,
	UpdateFeederZodSchema,
	FeederQueryZodSchema,
};
