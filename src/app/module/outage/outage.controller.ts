import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IOutageQuery, IOutageSearchQuery } from "./outage.interface";
import { OutageService } from "./outage.service";

const createOutage = catchAsync(async (req: Request, res: Response) => {
	const result = await OutageService.createOutage(req.body, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		message: `Outage created successfully. ${result.notifiedCustomers} customer(s) notified.`,
		data: result,
	});
});

const getAllOutages = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await OutageService.getAllOutages(req.query as unknown as IOutageQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Outages retrieved successfully",
		meta,
		data,
	});
});

const searchOutages = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await OutageService.searchOutages(req.query as unknown as IOutageSearchQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Search results retrieved successfully",
		meta,
		data,
	});
});

const getSingleOutage = catchAsync(async (req: Request, res: Response) => {
	const result = await OutageService.getSingleOutage(req.params.id as string);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Outage retrieved successfully",
		data: result,
	});
});

const updateOutage = catchAsync(async (req: Request, res: Response) => {
	const result = await OutageService.updateOutage(req.params.id as string, req.body, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Outage updated successfully",
		data: result,
	});
});

const deleteOutage = catchAsync(async (req: Request, res: Response) => {
	const result = await OutageService.deleteOutage(req.params.id as string, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Outage deleted successfully",
		data: result,
	});
});

export const OutageController = {
	createOutage,
	getAllOutages,
	searchOutages,
	getSingleOutage,
	updateOutage,
	deleteOutage,
};
