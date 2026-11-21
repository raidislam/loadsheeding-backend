import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AuthService } from "./auth.service";

const register = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.register(req.body);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		message: "Registration successful",
		data: result,
	});
});

const login = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.login(req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Login successful",
		data: result,
	});
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.refreshToken(req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "New tokens generated successfully",
		data: result,
	});
});

const logout = catchAsync(async (req: Request, res: Response) => {
	await AuthService.logout(req.user!.userId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Logged out successfully",
		data: null,
	});
});

export const AuthController = {
	register,
	login,
	refreshToken,
	logout,
};
