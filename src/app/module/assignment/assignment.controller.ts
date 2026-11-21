import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IAssignmentQuery, IMyJobsQuery } from "./assignment.interface";
import { AssignmentService } from "./assignment.service";

const createAssignment = catchAsync(async (req: Request, res: Response) => {
	const result = await AssignmentService.createAssignment(req.body, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		message: "Technician assigned successfully",
		data: result,
	});
});

const reassignTechnician = catchAsync(async (req: Request, res: Response) => {
	const result = await AssignmentService.reassignTechnician(
		req.params.id as string,
		req.body.technicianId,
		req.user!,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Technician changed successfully",
		data: result,
	});
});

const getAllAssignments = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await AssignmentService.getAllAssignments(req.query as unknown as IAssignmentQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Assignments retrieved successfully",
		meta,
		data,
	});
});

const getSingleAssignment = catchAsync(async (req: Request, res: Response) => {
	const result = await AssignmentService.getSingleAssignment(req.params.id as string, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Assignment retrieved successfully",
		data: result,
	});
});

const updateAssignmentStatus = catchAsync(async (req: Request, res: Response) => {
	const result = await AssignmentService.updateAssignmentStatus(req.params.id as string, req.body, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: `Job marked as ${result?.status}`,
		data: result,
	});
});

const submitRepairReport = catchAsync(async (req: Request, res: Response) => {
	const result = await AssignmentService.submitRepairReport(req.params.id as string, req.body, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		message: "Repair report submitted. Job completed and power restored.",
		data: result,
	});
});

const getMyJobs = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await AssignmentService.getMyJobs(req.user!, req.query as unknown as IMyJobsQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Your active jobs retrieved successfully",
		meta,
		data,
	});
});

const getMyHistory = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await AssignmentService.getMyHistory(
		req.user!,
		req.query as unknown as { page: number; limit: number },
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Your completed jobs retrieved successfully",
		meta,
		data,
	});
});

export const AssignmentController = {
	createAssignment,
	reassignTechnician,
	getAllAssignments,
	getSingleAssignment,
	updateAssignmentStatus,
	submitRepairReport,
	getMyJobs,
	getMyHistory,
};
