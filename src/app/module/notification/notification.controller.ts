import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { INotificationQuery } from "./notification.interface";
import { NotificationService } from "./notification.service";

const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await NotificationService.getMyNotifications(
		req.user!,
		req.query as unknown as INotificationQuery,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Notifications retrieved successfully",
		meta,
		data,
	});
});

const markAsRead = catchAsync(async (req: Request, res: Response) => {
	const { notification, alreadyRead } = await NotificationService.markAsRead(
		req.params.id as string,
		req.user!,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: alreadyRead ? "Notification was already read" : "Notification marked as read",
		data: notification,
	});
});

const markAllAsRead = catchAsync(async (req: Request, res: Response) => {
	const result = await NotificationService.markAllAsRead(req.user!);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: `${result.updatedCount} notification(s) marked as read`,
		data: result,
	});
});

export const NotificationController = {
	getMyNotifications,
	markAsRead,
	markAllAsRead,
};
