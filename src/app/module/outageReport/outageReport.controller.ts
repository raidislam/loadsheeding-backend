import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IAllReportsQuery, IMyReportsQuery } from "./outageReport.interface";
import { OutageReportService } from "./outageReport.service";

const createReport = catchAsync(async (req: Request, res: Response) => {
	const result = await OutageReportService.createReport(req.body, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		message: "Outage report submitted successfully",
		data: result,
	});
});

const getMyReports = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await OutageReportService.getMyReports(
		req.user!,
		req.query as unknown as IMyReportsQuery,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Your reports retrieved successfully",
		meta,
		data,
	});
});

const getAllReports = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await OutageReportService.getAllReports(req.query as unknown as IAllReportsQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Reports retrieved successfully",
		meta,
		data,
	});
});

const getSingleReport = catchAsync(async (req: Request, res: Response) => {
	const result = await OutageReportService.getSingleReport(req.params.id as string, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Report retrieved successfully",
		data: result,
	});
});

const reviewReport = catchAsync(async (req: Request, res: Response) => {
	const result = await OutageReportService.reviewReport(req.params.id as string, req.body, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: `Report marked as ${result.status}`,
		data: result,
	});
});

export const OutageReportController = {
	createReport,
	getMyReports,
	getAllReports,
	getSingleReport,
	reviewReport,
};
