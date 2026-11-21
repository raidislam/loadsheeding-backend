import type { Response } from "express";

type TMeta = {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
};

type TResponseData<T> = {
	statusCode: number;
	message: string;
	data: T;
	meta?: TMeta;
};

// Every successful response has the same shape:
// { success: true, message, data, meta? }
export const sendResponse = <T>(res: Response, payload: TResponseData<T>) => {
	res.status(payload.statusCode).json({
		success: true,
		message: payload.message,
		meta: payload.meta,
		data: payload.data,
	});
};
