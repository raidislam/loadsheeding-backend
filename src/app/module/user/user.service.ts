import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import { Role } from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { safeUserOmit } from "../../utils/safeUser";
import type { IChangePasswordPayload, IUpdateMyProfilePayload } from "./user.interface";

// Area with its full network path: area -> feeder -> substation -> zone
const areaWithHierarchy = {
	select: {
		id: true,
		name: true,
		code: true,
		feeder: {
			select: {
				id: true,
				name: true,
				code: true,
				substation: {
					select: {
						id: true,
						name: true,
						code: true,
						zone: { select: { id: true, name: true, code: true } },
					},
				},
			},
		},
	},
};

const getMyProfile = async (user: RequestUser) => {
	const profile = await prisma.user.findUnique({
		where: { id: user.userId },
		omit: safeUserOmit,
		include: { area: areaWithHierarchy },
	});

	if (!profile) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	return profile;
};

const updateMyProfile = async (user: RequestUser, payload: IUpdateMyProfilePayload) => {
	// Meter number and area only make sense for customers
	if (user.role !== Role.CUSTOMER && (payload.meterNumber || payload.areaId)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Only customers can set a meter number or area",
		);
	}

	if (payload.meterNumber) {
		const meterUsed = await prisma.user.findFirst({
			where: { meterNumber: payload.meterNumber, NOT: { id: user.userId } },
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

	return prisma.user.update({
		where: { id: user.userId },
		data: payload,
		omit: safeUserOmit,
		include: { area: areaWithHierarchy },
	});
};

const changePassword = async (user: RequestUser, payload: IChangePasswordPayload) => {
	const existingUser = await prisma.user.findUnique({
		where: { id: user.userId },
	});

	if (!existingUser) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	const isPasswordCorrect = await bcrypt.compare(payload.currentPassword, existingUser.password);

	if (!isPasswordCorrect) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Current password is incorrect");
	}

	const hashedPassword = await bcrypt.hash(payload.newPassword, config.bcrypt_salt_rounds);

	// Clearing the refresh token logs the user out everywhere,
	// so they must log in again with the new password.
	await prisma.user.update({
		where: { id: user.userId },
		data: { password: hashedPassword, refreshTokenHash: null },
	});
};

export const UserService = {
	getMyProfile,
	updateMyProfile,
	changePassword,
};
