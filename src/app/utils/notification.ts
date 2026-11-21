import type { Prisma } from "../../generated/prisma/client";
import { type NotificationType, Role, UserStatus } from "../../generated/prisma/enums";

type TNotification = {
	title: string;
	message: string;
	type: NotificationType;
};

// Send one notification to one user
export const notifyUser = async (
	tx: Prisma.TransactionClient,
	userId: string,
	notification: TNotification,
) => {
	await tx.notification.create({
		data: { userId, ...notification },
	});
};

// Send the same notification to every active customer living in an area.
// Returns how many customers were notified.
export const notifyAreaCustomers = async (
	tx: Prisma.TransactionClient,
	areaId: string,
	notification: TNotification,
) => {
	const customers = await tx.user.findMany({
		where: {
			areaId,
			role: Role.CUSTOMER,
			status: UserStatus.ACTIVE,
			deletedAt: null,
		},
		select: { id: true },
	});

	if (customers.length === 0) {
		return 0;
	}

	const result = await tx.notification.createMany({
		data: customers.map((customer) => ({ userId: customer.id, ...notification })),
	});

	return result.count;
};

// Send the same notification to every active admin (e.g. "new outage report")
export const notifyAdmins = async (tx: Prisma.TransactionClient, notification: TNotification) => {
	const admins = await tx.user.findMany({
		where: { role: Role.ADMIN, status: UserStatus.ACTIVE, deletedAt: null },
		select: { id: true },
	});

	if (admins.length === 0) {
		return 0;
	}

	const result = await tx.notification.createMany({
		data: admins.map((admin) => ({ userId: admin.id, ...notification })),
	});

	return result.count;
};

// Formats a date for messages in Bangladesh time, e.g. "21 Nov 2026, 2:00 pm"
export const formatDhakaTime = (date: Date) => {
	return date.toLocaleString("en-GB", {
		timeZone: "Asia/Dhaka",
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
};
