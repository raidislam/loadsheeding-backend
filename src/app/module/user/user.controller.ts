import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserService } from "./user.service";

const getMyProfile = catchAsync(async (req: Request, res: Response) => {
	const result = await UserService.getMyProfile(req.user!);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Profile retrieved successfully",
		data: result,
	});
});

const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
	const result = await UserService.updateMyProfile(req.user!, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Profile updated successfully",
		data: result,
	});
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
	await UserService.changePassword(req.user!, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Password changed successfully. Please log in again.",
		data: null,
	});
});

export const UserController = {
	getMyProfile,
	updateMyProfile,
	changePassword,
};
