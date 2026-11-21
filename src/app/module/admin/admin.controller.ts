import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IAuditLogQuery, IUsersQuery } from "./admin.interface";
import { AdminService } from "./admin.service";

const getDashboardStats = catchAsync(async (_req: Request, res: Response) => {
	const result = await AdminService.getDashboardStats();

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Dashboard statistics retrieved successfully",
		data: result,
	});
});

const getAllUsers = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await AdminService.getAllUsers(req.query as unknown as IUsersQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Users retrieved successfully",
		meta,
		data,
	});
});

const createTechnician = catchAsync(async (req: Request, res: Response) => {
	const result = await AdminService.createTechnician(req.body, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		message: "Technician account created successfully",
		data: result,
	});
});

const changeRole = catchAsync(async (req: Request, res: Response) => {
	const result = await AdminService.changeRole(req.params.id as string, req.body, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: `User role changed to ${result.role}`,
		data: result,
	});
});

const changeStatus = catchAsync(async (req: Request, res: Response) => {
	const result = await AdminService.changeStatus(req.params.id as string, req.body, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: result.status === "BLOCKED" ? "User blocked successfully" : "User unblocked successfully",
		data: result,
	});
});

const getAuditLogs = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await AdminService.getAuditLogs(req.query as unknown as IAuditLogQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Audit logs retrieved successfully",
		meta,
		data,
	});
});

export const AdminController = {
	getDashboardStats,
	getAllUsers,
	createTechnician,
	changeRole,
	changeStatus,
	getAuditLogs,
};
