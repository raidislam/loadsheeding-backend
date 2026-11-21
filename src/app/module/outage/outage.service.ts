import httpStatus from "http-status";
import { NotificationType, OutageStatus, OutageType } from "../../../generated/prisma/enums";
import type { OutageWhereInput } from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { createAuditLog } from "../../utils/auditLog";
import { formatDhakaTime, notifyAreaCustomers } from "../../utils/notification";
import { buildMeta, getSkip } from "../../utils/pagination";
import { areaParents } from "../area/area.service";
import type {
	ICreateOutagePayload,
	IOutageQuery,
	IOutageSearchQuery,
	IUpdateOutagePayload,
} from "./outage.interface";

// Every outage response includes its area with the full network path
const outageInclude = {
	area: { select: { id: true, name: true, code: true, ...areaParents } },
};

// Allowed status changes. RESOLVED and CANCELLED are final.
const allowedStatusChanges: Record<OutageStatus, OutageStatus[]> = {
	SCHEDULED: [OutageStatus.ONGOING, OutageStatus.CANCELLED],
	ONGOING: [OutageStatus.RESOLVED],
	RESOLVED: [],
	CANCELLED: [],
};

const findActiveOutage = async (id: string) => {
	const outage = await prisma.outage.findFirst({
		where: { id, deletedAt: null },
		include: { area: { select: { id: true, name: true } } },
	});

	if (!outage) {
		throw new AppError(httpStatus.NOT_FOUND, "Outage not found");
	}

	return outage;
};

const createOutage = async (payload: ICreateOutagePayload, admin: RequestUser) => {
	const area = await prisma.area.findFirst({
		where: { id: payload.areaId, deletedAt: null },
	});

	if (!area) {
		throw new AppError(httpStatus.NOT_FOUND, "Area not found");
	}

	// A planned outage starts as SCHEDULED; a sudden one is already ONGOING
	const status = payload.type === OutageType.SCHEDULED ? OutageStatus.SCHEDULED : OutageStatus.ONGOING;

	// Transaction: outage + notifications + audit log are saved together, or not at all
	return prisma.$transaction(async (tx) => {
		const outage = await tx.outage.create({
			data: { ...payload, status, createdById: admin.userId },
			include: outageInclude,
		});

		const isScheduled = payload.type === OutageType.SCHEDULED;

		const notifiedCustomers = await notifyAreaCustomers(tx, area.id, {
			title: isScheduled ? `Scheduled outage in ${area.name}` : `Power outage in ${area.name}`,
			message: isScheduled
				? `Power will be off in ${area.name} from ${formatDhakaTime(payload.startTime)} to ${formatDhakaTime(payload.expectedRestoreTime)}. Reason: ${payload.reason}`
				: `There is a power outage in ${area.name}. Expected restoration: ${formatDhakaTime(payload.expectedRestoreTime)}. Reason: ${payload.reason}`,
			type: isScheduled ? NotificationType.SCHEDULED_OUTAGE : NotificationType.OUTAGE_UPDATE,
		});

		await createAuditLog(tx, {
			userId: admin.userId,
			action: "OUTAGE_CREATED",
			entityType: "Outage",
			entityId: outage.id,
			details: { type: outage.type, areaId: area.id, areaName: area.name, notifiedCustomers },
		});

		return { ...outage, notifiedCustomers };
	});
};

const getAllOutages = async (query: IOutageQuery) => {
	const { page, limit, sortBy, sortOrder, status, type, areaId, feederId, substationId, zoneId, from, to } = query;

	const where: OutageWhereInput = { deletedAt: null };

	if (status) where.status = status;
	if (type) where.type = type;
	if (areaId) where.areaId = areaId;

	// Filter by feeder / substation / zone through the area relation
	if (feederId || substationId || zoneId) {
		where.area = {
			...(feederId ? { feederId } : {}),
			...(substationId || zoneId
				? {
						feeder: {
							...(substationId ? { substationId } : {}),
							...(zoneId ? { substation: { zoneId } } : {}),
						},
					}
				: {}),
		};
	}

	// Date range on startTime
	if (from || to) {
		where.startTime = {
			...(from ? { gte: from } : {}),
			...(to ? { lte: to } : {}),
		};
	}

	const [outages, total] = await Promise.all([
		prisma.outage.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			include: outageInclude,
		}),
		prisma.outage.count({ where }),
	]);

	return { data: outages, meta: buildMeta(page, limit, total) };
};

// GET /outages/search?q=Uttara
// Looks in title, reason, description and area / feeder / substation / zone names.
const searchOutages = async (query: IOutageSearchQuery) => {
	const { q, page, limit } = query;
	const contains = { contains: q, mode: "insensitive" as const };

	const where: OutageWhereInput = {
		deletedAt: null,
		OR: [
			{ title: contains },
			{ reason: contains },
			{ description: contains },
			{ area: { name: contains } },
			{ area: { code: contains } },
			{ area: { feeder: { name: contains } } },
			{ area: { feeder: { substation: { name: contains } } } },
			{ area: { feeder: { substation: { zone: { name: contains } } } } },
		],
	};

	const [outages, total] = await Promise.all([
		prisma.outage.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { startTime: "desc" },
			include: outageInclude,
		}),
		prisma.outage.count({ where }),
	]);

	return { data: outages, meta: buildMeta(page, limit, total) };
};

const getSingleOutage = async (id: string) => {
	const outage = await prisma.outage.findFirst({
		where: { id, deletedAt: null },
		include: {
			...outageInclude,
			_count: { select: { reports: true } }, // linked customer reports
		},
	});

	if (!outage) {
		throw new AppError(httpStatus.NOT_FOUND, "Outage not found");
	}

	return outage;
};

const updateOutage = async (id: string, payload: IUpdateOutagePayload, admin: RequestUser) => {
	const outage = await findActiveOutage(id);

	// Finished outages can't be edited
	if (outage.status === OutageStatus.RESOLVED || outage.status === OutageStatus.CANCELLED) {
		throw new AppError(httpStatus.CONFLICT, `Outage is already ${outage.status} and can't be changed`);
	}

	// Check the status change is allowed, e.g. SCHEDULED -> RESOLVED is not
	const statusChanged = payload.status !== undefined && payload.status !== outage.status;

	if (statusChanged && !allowedStatusChanges[outage.status].includes(payload.status as OutageStatus)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Invalid status change: ${outage.status} -> ${payload.status}. Allowed: ${allowedStatusChanges[outage.status].join(", ")}`,
		);
	}

	// Check times using the new values, or the old ones if not sent
	const startTime = payload.startTime ?? outage.startTime;
	const expectedRestoreTime = payload.expectedRestoreTime ?? outage.expectedRestoreTime;

	if (expectedRestoreTime <= startTime) {
		throw new AppError(httpStatus.BAD_REQUEST, "expectedRestoreTime must be after startTime");
	}

	const timeChanged =
		startTime.getTime() !== outage.startTime.getTime() ||
		expectedRestoreTime.getTime() !== outage.expectedRestoreTime.getTime();

	// Restoration time is recorded automatically when it is resolved
	const actualRestoreTime = payload.status === OutageStatus.RESOLVED ? new Date() : undefined;

	return prisma.$transaction(async (tx) => {
		const updated = await tx.outage.update({
			where: { id },
			data: { ...payload, actualRestoreTime },
			include: outageInclude,
		});

		// Tell the customers about status changes or a new time
		let notifiedCustomers = 0;
		const areaName = outage.area.name;

		if (statusChanged) {
			const messages: Partial<Record<OutageStatus, string>> = {
				ONGOING: `Power is now off in ${areaName}. Expected restoration: ${formatDhakaTime(expectedRestoreTime)}.`,
				RESOLVED: `Power has been restored in ${areaName}.`,
				CANCELLED: `The scheduled outage in ${areaName} (${formatDhakaTime(startTime)}) has been cancelled.`,
			};

			notifiedCustomers = await notifyAreaCustomers(tx, outage.areaId, {
				title: `Outage ${updated.status.toLowerCase()} - ${areaName}`,
				message: messages[updated.status] ?? `Outage status changed to ${updated.status}.`,
				type: updated.status === OutageStatus.RESOLVED ? NotificationType.POWER_RESTORED : NotificationType.OUTAGE_UPDATE,
			});
		} else if (timeChanged) {
			notifiedCustomers = await notifyAreaCustomers(tx, outage.areaId, {
				title: `Outage time updated - ${areaName}`,
				message: `New outage time in ${areaName}: ${formatDhakaTime(startTime)} to ${formatDhakaTime(expectedRestoreTime)}.`,
				type: NotificationType.OUTAGE_UPDATE,
			});
		}

		await createAuditLog(tx, {
			userId: admin.userId,
			action: statusChanged ? "OUTAGE_STATUS_CHANGED" : "OUTAGE_UPDATED",
			entityType: "Outage",
			entityId: id,
			details: {
				changedFields: Object.keys(payload),
				...(statusChanged ? { oldStatus: outage.status, newStatus: updated.status } : {}),
				notifiedCustomers,
			},
		});

		return { ...updated, notifiedCustomers };
	});
};

// Soft delete. An ONGOING outage can't be deleted (resolve it instead).
const deleteOutage = async (id: string, admin: RequestUser) => {
	const outage = await findActiveOutage(id);

	if (outage.status === OutageStatus.ONGOING) {
		throw new AppError(httpStatus.CONFLICT, "Cannot delete an ONGOING outage. Mark it RESOLVED first.");
	}

	return prisma.$transaction(async (tx) => {
		const deleted = await tx.outage.update({
			where: { id },
			data: { deletedAt: new Date() },
			select: { id: true, title: true, status: true, deletedAt: true },
		});

		// Customers were told about this scheduled outage, so tell them it's off
		if (outage.status === OutageStatus.SCHEDULED) {
			await notifyAreaCustomers(tx, outage.areaId, {
				title: `Outage cancelled - ${outage.area.name}`,
				message: `The scheduled outage in ${outage.area.name} (${formatDhakaTime(outage.startTime)}) has been cancelled.`,
				type: NotificationType.OUTAGE_UPDATE,
			});
		}

		await createAuditLog(tx, {
			userId: admin.userId,
			action: "OUTAGE_DELETED",
			entityType: "Outage",
			entityId: id,
			details: { title: outage.title, statusAtDelete: outage.status },
		});

		return deleted;
	});
};

export const OutageService = {
	createOutage,
	getAllOutages,
	searchOutages,
	getSingleOutage,
	updateOutage,
	deleteOutage,
};
