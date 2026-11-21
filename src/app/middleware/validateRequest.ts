import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

type TSource = "body" | "query" | "params";

// Usage:
//   validateRequest(CreateZoneSchema)            -> checks req.body
//   validateRequest(OutageQuerySchema, "query")  -> checks req.query
// If validation fails, Zod throws a ZodError and globalErrorHandler
// turns it into a 400 response with the list of field errors.
export const validateRequest = (schema: ZodType, source: TSource = "body") => {
	return (req: Request, _res: Response, next: NextFunction) => {
		try {
			const parsed = schema.parse(req[source] ?? {});

			if (source === "query") {
				// In Express 5, req.query is read-only, so we redefine it
				// to hold the cleaned values (e.g. "10" -> 10).
				Object.defineProperty(req, "query", { value: parsed, writable: true });
			} else {
				req[source] = parsed;
			}

			next();
		} catch (error) {
			next(error);
		}
	};
};
