import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IAreaQuery } from "./area.interface";
import { AreaService } from "./area.service";

const createArea = catchAsync(async (req: Request, res: Response) => {
	const result = await AreaService.createArea(req.body);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		message: "Area created successfully",
		data: result,
	});
});

const getAllAreas = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await AreaService.getAllAreas(req.query as unknown as IAreaQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Areas retrieved successfully",
		meta,
		data,
	});
});

const getSingleArea = catchAsync(async (req: Request, res: Response) => {
	const result = await AreaService.getSingleArea(req.params.id as string);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Area retrieved successfully",
		data: result,
	});
});

const updateArea = catchAsync(async (req: Request, res: Response) => {
	const result = await AreaService.updateArea(req.params.id as string, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Area updated successfully",
		data: result,
	});
});

const deleteArea = catchAsync(async (req: Request, res: Response) => {
	const result = await AreaService.deleteArea(req.params.id as string);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Area deleted successfully",
		data: result,
	});
});

export const AreaController = {
	createArea,
	getAllAreas,
	getSingleArea,
	updateArea,
	deleteArea,
};
