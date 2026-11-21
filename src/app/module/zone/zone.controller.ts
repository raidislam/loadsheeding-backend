import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IZoneQuery } from "./zone.interface";
import { ZoneService } from "./zone.service";

const createZone = catchAsync(async (req: Request, res: Response) => {
	const result = await ZoneService.createZone(req.body);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		message: "Zone created successfully",
		data: result,
	});
});

const getAllZones = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await ZoneService.getAllZones(req.query as unknown as IZoneQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Zones retrieved successfully",
		meta,
		data,
	});
});

const getSingleZone = catchAsync(async (req: Request, res: Response) => {
	const result = await ZoneService.getSingleZone(req.params.id as string);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Zone retrieved successfully",
		data: result,
	});
});

const updateZone = catchAsync(async (req: Request, res: Response) => {
	const result = await ZoneService.updateZone(req.params.id as string, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Zone updated successfully",
		data: result,
	});
});

const deleteZone = catchAsync(async (req: Request, res: Response) => {
	const result = await ZoneService.deleteZone(req.params.id as string);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Zone deleted successfully",
		data: result,
	});
});

export const ZoneController = {
	createZone,
	getAllZones,
	getSingleZone,
	updateZone,
	deleteZone,
};
