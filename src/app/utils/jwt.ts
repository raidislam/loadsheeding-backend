import crypto from "crypto";
import httpStatus from "http-status";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { AppError } from "./AppError";

const createToken = (payload: JwtPayload, secret: string, expiresIn: string) => {
	return jwt.sign(payload, secret, {
		expiresIn: expiresIn as SignOptions["expiresIn"],
	});
};

// Returns the decoded payload, or throws 401 if the token is invalid / expired.
const verifyToken = (token: string, secret: string) => {
	try {
		return jwt.verify(token, secret) as JwtPayload;
	} catch (error) {
		if (error instanceof jwt.TokenExpiredError) {
			throw new AppError(httpStatus.UNAUTHORIZED, "Token has expired. Please log in again.");
		}
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid token. Please log in again.");
	}
};

// The refresh token is saved in the DB as a SHA-256 hash (not plain text).
// bcrypt is not used here because it only reads the first 72 bytes,
// and a JWT is much longer than that.
const hashToken = (token: string) => {
	return crypto.createHash("sha256").update(token).digest("hex");
};

export const jwtUtils = {
	createToken,
	verifyToken,
	hashToken,
};
