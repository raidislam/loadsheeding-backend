import httpStatus from "http-status";
import type { NotificationWhereInput } from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { buildMeta, getSkip } from "../../utils/pagination";
import type { INotificationQuery } from "./notification.interface";

// Only the fields the frontend needs (no relations)
const notificationSelect = {
	id: true,
	title: true,
	message: true,
	type: true,
	isRead: true,
	createdAt: true,
};

// Every query filters by the logged-in user's id (taken from the JWT),
// so a user can never see or change someone else's notifications.

const getMyNotifications = async (user: RequestUser, query: INotificationQuery) => {
	const { page, limit, unreadOnly } = query;

	const where: NotificationWhereInput = { userId: user.userId };

	if (unreadOnly) {
		where.isRead = false;
	}

	const [notifications, total, unreadCount] = await Promise.all([
		prisma.notification.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { createdAt: "desc" }, // newest first
			select: notificationSelect,
		}),
		prisma.notification.count({ where }),
		// for the unread badge in the frontend
		prisma.notification.count({ where: { userId: user.userId, isRead: false } }),
	]);

	return {
		data: notifications,
		meta: { ...buildMeta(page, limit, total), unreadCount },
	};
};

const markAsRead = async (id: string, user: RequestUser) => {
	// Look up by id AND owner. Someone else's notification -> 404
	const notification = await prisma.notification.findFirst({
		where: { id, userId: user.userId },
		select: notificationSelect,
	});

	if (!notification) {
		throw new AppError(httpStatus.NOT_FOUND, "Notification not found");
	}

	// Already read: nothing to change, just return it
	if (notification.isRead) {
		return { notification, alreadyRead: true };
	}

	const updated = await prisma.notification.update({
		where: { id },
		data: { isRead: true },
		select: notificationSelect,
	});

	return { notification: updated, alreadyRead: false };
};

const markAllAsRead = async (user: RequestUser) => {
	// Only this user's UNREAD notifications are touched
	const result = await prisma.notification.updateMany({
		where: { userId: user.userId, isRead: false },
		data: { isRead: true },
	});

	return { updatedCount: result.count };
};

export const NotificationService = {
	getMyNotifications,
	markAsRead,
	markAllAsRead,
};
