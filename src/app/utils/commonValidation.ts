import { z } from "zod";

// For routes like /zones/:id
export const IdParamZodSchema = z.object({
	id: z.uuid("Invalid id format"),
});

// Common query fields for list APIs: ?page=1&limit=10&sortOrder=desc&searchTerm=dhaka
// z.coerce turns the query string "2" into the number 2.
export const paginationQueryFields = {
	page: z.coerce.number().int().min(1, "page must be at least 1").default(1),
	limit: z.coerce.number().int().min(1, "limit must be at least 1").max(100, "limit cannot exceed 100").default(10),
	sortOrder: z.enum(["asc", "desc"], "sortOrder must be asc or desc").default("desc"),
	searchTerm: z.string().trim().min(1).optional(),
};
