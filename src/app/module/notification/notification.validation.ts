import { z } from "zod";
import { paginationQueryFields } from "../../utils/commonValidation";

// ?page=1&limit=10&unreadOnly=true
// Note: z.coerce.boolean() would turn the text "false" into true,
// so we accept only "true" / "false" and convert it ourselves.
const NotificationQueryZodSchema = z.object({
	page: paginationQueryFields.page, // default 1
	limit: paginationQueryFields.limit, // default 10, max 100
	unreadOnly: z
		.enum(["true", "false"], "unreadOnly must be true or false")
		.default("false")
		.transform((value) => value === "true"),
});

export const NotificationValidation = {
	NotificationQueryZodSchema,
};
