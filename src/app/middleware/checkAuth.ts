import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import type { Role } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { jwtUtils } from "../utils/jwt";

export interface RequestUser {
	userId: string;
	name: string;
	email: string;
	role: Role;
}

declare global {
	namespace Express {
		interface Request {
			user?: RequestUser;
		}
	}
}

// Usage:
//   auth()                                  -> any logged-in user
//   auth(Role.ADMIN)                        -> admin only
//   auth(Role.ADMIN, Role.TECHNICIAN)       -> admin or technician
export const auth = (...allowedRoles: Role[]) => {
	return catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
		// 1. Read "Authorization: Bearer <token>"
		const authHeader = req.headers.authorization;

		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"You are not logged in. Please provide a Bearer token.",
			);
		}

		const token = authHeader.split(" ")[1];

		// 2. Verify the token signature and expiry
		const decoded = jwtUtils.verifyToken(token, config.jwt_access_secret);

		// 3. Load the user from the DB. The role is taken from the DB,
		//    never from the request body or headers.
		const user = await prisma.user.findUnique({
			where: { id: decoded.userId },
		});

		if (!user || user.deletedAt) {
			throw new AppError(httpStatus.UNAUTHORIZED, "User not found. Please log in again.");
		}

		if (user.status === "BLOCKED") {
			throw new AppError(httpStatus.FORBIDDEN, "Your account has been blocked. Please contact support.");
		}

		// After logout (or password change) the refresh token hash is removed,
		// so old access tokens stop working too.
		if (!user.refreshTokenHash) {
			throw new AppError(httpStatus.UNAUTHORIZED, "Session ended. Please log in again.");
		}

		// 4. Role check
		if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Forbidden. You don't have permission to access this resource.",
			);
		}

		req.user = {
			userId: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
		};

		next();
	});
};
