import bcrypt from "bcryptjs";
import crypto from "crypto";
import httpStatus from "http-status";
import { Role, UserStatus } from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { jwtUtils } from "../../utils/jwt";
import { safeUserOmit } from "../../utils/safeUser";
import type { ILoginPayload, IRefreshTokenPayload, IRegisterPayload } from "./auth.interface";

// Creates a new access + refresh token pair and saves the refresh token hash.
// Saving a new hash also makes any older refresh token of this user invalid.
const createTokensForUser = async (user: { id: string; role: Role }) => {
	const accessToken = jwtUtils.createToken(
		{ userId: user.id, role: user.role },
		config.jwt_access_secret,
		config.jwt_access_expires_in,
	);

	// jti = random id, so every refresh token is unique
	// (two tokens created in the same second would otherwise be identical)
	const refreshToken = jwtUtils.createToken(
		{ userId: user.id, jti: crypto.randomUUID() },
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in,
	);

	await prisma.user.update({
		where: { id: user.id },
		data: { refreshTokenHash: jwtUtils.hashToken(refreshToken) },
	});

	return { accessToken, refreshToken };
};

const register = async (payload: IRegisterPayload) => {
	const existingUser = await prisma.user.findUnique({
		where: { email: payload.email },
	});

	if (existingUser) {
		throw new AppError(httpStatus.CONFLICT, "An account with this email already exists");
	}

	if (payload.meterNumber) {
		const meterUsed = await prisma.user.findUnique({
			where: { meterNumber: payload.meterNumber },
		});
		if (meterUsed) {
			throw new AppError(httpStatus.CONFLICT, "This meter number is already registered");
		}
	}

	if (payload.areaId) {
		const area = await prisma.area.findFirst({
			where: { id: payload.areaId, deletedAt: null },
		});
		if (!area) {
			throw new AppError(httpStatus.NOT_FOUND, "Selected area not found");
		}
	}

	const hashedPassword = await bcrypt.hash(payload.password, config.bcrypt_salt_rounds);

	const user = await prisma.user.create({
		data: {
			...payload,
			password: hashedPassword,
			role: Role.CUSTOMER, // public registration is always CUSTOMER
		},
		omit: safeUserOmit,
	});

	const tokens = await createTokensForUser(user);

	return { user, ...tokens };
};

const login = async (payload: ILoginPayload) => {
	const user = await prisma.user.findUnique({
		where: { email: payload.email },
	});

	// Same message for "no user" and "wrong password",
	// so an attacker can't find out which emails are registered.
	if (!user || user.deletedAt) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
	}

	const isPasswordCorrect = await bcrypt.compare(payload.password, user.password);

	if (!isPasswordCorrect) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "Your account has been blocked. Please contact support.");
	}

	const tokens = await createTokensForUser(user);

	const { password, refreshTokenHash, ...safeUser } = user;

	return { user: safeUser, ...tokens };
};

const refreshToken = async (payload: IRefreshTokenPayload) => {
	// 1. Check signature and expiry
	const decoded = jwtUtils.verifyToken(payload.refreshToken, config.jwt_refresh_secret);

	const user = await prisma.user.findUnique({
		where: { id: decoded.userId },
	});

	if (!user || user.deletedAt) {
		throw new AppError(httpStatus.UNAUTHORIZED, "User not found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "Your account has been blocked. Please contact support.");
	}

	// 2. The token must match the one saved in the DB.
	//    Fails after logout, or if this token was already used (rotation).
	if (!user.refreshTokenHash || user.refreshTokenHash !== jwtUtils.hashToken(payload.refreshToken)) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token is no longer valid. Please log in again.");
	}

	// 3. Issue a new pair (the old refresh token can't be used again)
	return createTokensForUser(user);
};

const logout = async (userId: string) => {
	await prisma.user.update({
		where: { id: userId },
		data: { refreshTokenHash: null },
	});
};

export const AuthService = {
	register,
	login,
	refreshToken,
	logout,
};
