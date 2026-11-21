import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IAllBillsQuery, IMyBillsQuery } from "./bill.interface";
import { BillService } from "./bill.service";

const createBill = catchAsync(async (req: Request, res: Response) => {
	const result = await BillService.createBill(req.body, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		message: "Bill created successfully",
		data: result,
	});
});

const getMyBills = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await BillService.getMyBills(req.user!, req.query as unknown as IMyBillsQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Your bills retrieved successfully",
		meta,
		data,
	});
});

const getAllBills = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await BillService.getAllBills(req.query as unknown as IAllBillsQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Bills retrieved successfully",
		meta,
		data,
	});
});

export const BillController = {
	createBill,
	getMyBills,
	getAllBills,
};
