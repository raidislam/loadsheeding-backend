import { z } from "zod";
import { paginationQueryFields } from "../../utils/commonValidation";
import { codeField } from "../zone/zone.validation";

const CreateSubstationZodSchema = z.object({
	name: z.string("Name is required").trim().min(2, "Name must be at least 2 characters").max(100),
	code: codeField,
	zoneId: z.uuid("Invalid zoneId"),
	capacityMW: z.number("capacityMW must be a number").positive("capacityMW must be greater than 0").optional(),
	address: z.string().trim().max(255).optional(),
});

const UpdateSubstationZodSchema = CreateSubstationZodSchema.partial().refine(
	(data) => Object.keys(data).length > 0,
	{ message: "Provide at least one field to update" },
);

const SubstationQueryZodSchema = z.object({
	...paginationQueryFields,
	sortBy: z.enum(["name", "code", "capacityMW", "createdAt"]).default("createdAt"),
	zoneId: z.uuid("Invalid zoneId").optional(),
});

export const SubstationValidation = {
	CreateSubstationZodSchema,
	UpdateSubstationZodSchema,
	SubstationQueryZodSchema,
};
