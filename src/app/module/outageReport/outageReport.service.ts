import httpStatus from "http-status";
import { NotificationType, ReportStatus, Role } from "../../../generated/prisma/enums";
import type { OutageReportWhereInput } from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { createAuditLog } from "../../utils/auditLog";
import { notifyAdmins, notifyUser } from "../../utils/notification";
import { buildMeta, getSkip } from "../../utils/pagination";
import { areaParents } from "../area/area.service";
import type {
	IAllReportsQuery,
	ICreateReportPayload,
	IMyReportsQuery,
	IReviewReportPayload,
} from "./outageReport.interface";

// A report is "open" until it is RESOLVED or REJECTED
const OPEN_STATUSES: ReportStatus[] = [
	ReportStatus.PENDING,
	ReportStatus.UNDER_REVIEW,
	ReportStatus.ASSIGNED,
	ReportStatus.IN_PROGRESS,
];

// What the admin can change here (ASSIGNED etc. come from the technician workflow)
const allowedReviewChanges: Partial<Record<ReportStatus, ReportStatus[]>> = {
	PENDING: [ReportStatus.UNDER_REVIEW, ReportStatus.REJECTED],
	UNDER_REVIEW: [ReportStatus.REJECTED],
};

const reportListInclude = {
	area: { select: { id: true, name: true, code: true, ...areaParents } },
	assignment: {
		select: {
			id: true,
			status: true,
			technician: { select: { id: true, name: true, phone: true } },
		},
	},
};

const createReport = async (payload: ICreateReportPayload, customer: RequestUser) => {
	// Use the area from the body, or the customer's own area
	let areaId = payload.areaId;

	if (!areaId) {
		const profile = await prisma.user.findUnique({
			where: { id: customer.userId },
			select: { areaId: true },
		});
		areaId = profile?.areaId ?? undefined;
	}

	if (!areaId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"areaId is required (or set your area in your profile first)",
		);
	}

	const area = await prisma.area.findFirst({ where: { id: areaId, deletedAt: null } });

	if (!area) {
		throw new AppError(httpStatus.NOT_FOUND, "Area not found");
	}

	// Stop duplicate reports: one open report per customer per area
	const openReport = await prisma.outageReport.findFirst({
		where: { customerId: customer.userId, areaId, status: { in: OPEN_STATUSES } },
	});

	if (openReport) {
		throw new AppError(
			httpStatus.CONFLICT,
			`You already have an open report for this area (status: ${openReport.status}). Please wait for it to be resolved.`,
		);
	}

	return prisma.$transaction(async (tx) => {
		const report = await tx.outageReport.create({
			data: { ...payload, areaId, customerId: customer.userId },
			include: reportListInclude,
		});

		await notifyAdmins(tx, {
			title: "New outage report",
			message: `${customer.name} reported an outage in ${area.name}: "${report.title}"`,
			type: NotificationType.REPORT_UPDATE,
		});

		await createAuditLog(tx, {
			userId: customer.userId,
			action: "REPORT_CREATED",
			entityType: "OutageReport",
			entityId: report.id,
			details: { areaId, areaName: area.name },
		});

		return report;
	});
};

const getMyReports = async (customer: RequestUser, query: IMyReportsQuery) => {
	const { page, limit, sortBy, sortOrder, status } = query;

	const where: OutageReportWhereInput = { customerId: customer.userId };

	if (status) where.status = status;

	const [reports, total] = await Promise.all([
		prisma.outageReport.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			include: reportListInclude,
		}),
		prisma.outageReport.count({ where }),
	]);

	return { data: reports, meta: buildMeta(page, limit, total) };
};

const getAllReports = async (query: IAllReportsQuery) => {
	const { page, limit, sortBy, sortOrder, status, areaId, zoneId, customerId, searchTerm } = query;

	const where: OutageReportWhereInput = {};

	if (status) where.status = status;
	if (areaId) where.areaId = areaId;
	if (customerId) where.customerId = customerId;
	if (zoneId) where.area = { feeder: { substation: { zoneId } } };

	if (searchTerm) {
		const contains = { contains: searchTerm, mode: "insensitive" as const };
		where.OR = [
			{ title: contains },
			{ description: contains },
			{ address: contains },
			{ area: { name: contains } },
			{ customer: { name: contains } },
			{ customer: { email: contains } },
		];
	}

	const [reports, total] = await Promise.all([
		prisma.outageReport.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			include: {
				...reportListInclude,
				customer: { select: { id: true, name: true, email: true, phone: true } },
			},
		}),
		prisma.outageReport.count({ where }),
	]);

	return { data: reports, meta: buildMeta(page, limit, total) };
};

const getSingleReport = async (id: string, user: RequestUser) => {
	const report = await prisma.outageReport.findUnique({
		where: { id },
		include: {
			area: { select: { id: true, name: true, code: true, ...areaParents } },
			customer: { select: { id: true, name: true, email: true, phone: true, meterNumber: true } },
			outage: { select: { id: true, title: true, type: true, status: true, startTime: true, expectedRestoreTime: true } },
			assignment: {
				include: {
					technician: { select: { id: true, name: true, phone: true } },
					repairRecords: { orderBy: { createdAt: "desc" } },
				},
			},
		},
	});

	// A customer may only see their own reports. We answer 404 (not 403)
	// so nobody can find out which report ids exist.
	if (!report || (user.role === Role.CUSTOMER && report.customerId !== user.userId)) {
		throw new AppError(httpStatus.NOT_FOUND, "Report not found");
	}

	return report;
};

// Admin review: PENDING -> UNDER_REVIEW / REJECTED, UNDER_REVIEW -> REJECTED
const reviewReport = async (id: string, payload: IReviewReportPayload, admin: RequestUser) => {
	const report = await prisma.outageReport.findUnique({ where: { id } });

	if (!report) {
		throw new AppError(httpStatus.NOT_FOUND, "Report not found");
	}

	const allowed = allowedReviewChanges[report.status] ?? [];

	if (!allowed.includes(payload.status)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Invalid status change: ${report.status} -> ${payload.status}.${allowed.length ? ` Allowed: ${allowed.join(", ")}` : " This report can no longer be reviewed."}`,
		);
	}

	// Optional: link to an outage in the SAME area
	if (payload.outageId) {
		const outage = await prisma.outage.findFirst({
			where: { id: payload.outageId, deletedAt: null },
		});

		if (!outage) {
			throw new AppError(httpStatus.NOT_FOUND, "Outage not found");
		}

		if (outage.areaId !== report.areaId) {
			throw new AppError(httpStatus.BAD_REQUEST, "The outage must be in the same area as the report");
		}
	}

	return prisma.$transaction(async (tx) => {
		const updated = await tx.outageReport.update({
			where: { id },
			data: {
				status: payload.status,
				adminNote: payload.adminNote,
				outageId: payload.outageId,
			},
			include: reportListInclude,
		});

		const isRejected = payload.status === ReportStatus.REJECTED;

		await notifyUser(tx, report.customerId, {
			title: isRejected ? "Your outage report was rejected" : "Your outage report is under review",
			message: isRejected
				? `Report "${report.title}" was rejected. Reason: ${payload.adminNote}`
				: `Report "${report.title}" is being reviewed by our team.`,
			type: NotificationType.REPORT_UPDATE,
		});

		await createAuditLog(tx, {
			userId: admin.userId,
			action: "REPORT_STATUS_CHANGED",
			entityType: "OutageReport",
			entityId: id,
			details: {
				oldStatus: report.status,
				newStatus: payload.status,
				...(payload.outageId ? { linkedOutageId: payload.outageId } : {}),
			},
		});

		return updated;
	});
};

export const OutageReportService = {
	createReport,
	getMyReports,
	getAllReports,
	getSingleReport,
	reviewReport,
};
