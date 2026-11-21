import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client";
import config from "../config";
import { AppError } from "../utils/AppError";

type TErrorDetail = {
	path: string;
	message: string;
};

export const globalErrorHandler = (
	err: any,
	_req: Request,
	res: Response,
	_next: NextFunction,
) => {
	if (config.node_env === "development") {
		console.log("Error from Global Error Handler:", err);
	}

	let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
	let message = "Something went wrong";
	let errors: TErrorDetail[] = [];

	if (err instanceof ZodError) {
		// Validation error: list every invalid field
		statusCode = httpStatus.BAD_REQUEST;
		message = "Validation failed";
		errors = err.issues.map((issue) => ({
			path: issue.path.join("."),
			message: issue.message,
		}));
	} else if (err instanceof AppError) {
		statusCode = err.statusCode;
		message = err.message;
	} else if (err instanceof Prisma.PrismaClientKnownRequestError) {
		statusCode = httpStatus.BAD_REQUEST;
		if (err.code === "P2002") {
			statusCode = httpStatus.CONFLICT;
			const fields = (err.meta?.target as string[] | undefined)?.join(", ");
			message = fields ? `Duplicate value for: ${fields}` : "Duplicate value";
		} else if (err.code === "P2003") {
			message = "Related record not found (foreign key constraint failed)";
		} else if (err.code === "P2025") {
			statusCode = httpStatus.NOT_FOUND;
			message = "Record not found";
		} else {
			message = "Database request error";
		}
	} else if (err instanceof Prisma.PrismaClientValidationError) {
		statusCode = httpStatus.BAD_REQUEST;
		message = "Invalid data sent to the database";
	} else if (err?.type === "entity.parse.failed") {
		// Invalid JSON in the request body (thrown by express.json())
		statusCode = httpStatus.BAD_REQUEST;
		message = "Invalid JSON in request body";
	} else if (err instanceof Error && config.node_env === "development") {
		message = err.message;
	}

	res.status(statusCode).json({
		success: false,
		message,
		errors,
		// Stack trace only in development, never in production
		stack: config.node_env === "development" ? err?.stack : undefined,
	});
};
