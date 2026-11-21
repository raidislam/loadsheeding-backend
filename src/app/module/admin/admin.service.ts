import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import type { Prisma } from "../../../generated/prisma/client";
import {
	AssignmentStatus,
	BillStatus,
	NotificationType,
	OutageStatus,
	PaymentStatus,
	ReportStatus,
	Role,
	UserStatus,
} from "../../../generated/prisma/enums";
import type { AuditLogWhereInput, UserWhereInput } from "../../../generated/prisma/models";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { createAuditLog } from "../../utils/auditLog";
import { notifyUser } from "../../utils/notification";
import { buildMeta, getSkip } from "../../utils/pagination";
import { safeUserOmit } from "../../utils/safeUser";
import type {
	IAuditLogQuery,
	IChangeRolePayload,
	IChangeStatusPayload,
	ICreateTechnicianPayload,
	IUsersQuery,
} from "./admin.interface";

// Turns Prisma groupBy rows into { STATUS: count }, with 0 for missing statuses.
// e.g. [{ status: "PENDING", _count: { _all: 3 } }] -> { PENDING: 3, RESOLVED: 0, ... }
const toCountMap = (allStatuses: string[], rows: { status: string; _count: { _all: number } }[]) => {
	const result: Record<string, number> = {};
	for (const status of allStatuses) {
		result[status] = rows.find((row) => row.status === status)?._count._all ?? 0;
	}
	return result;
};

const activeAdminWhere: UserWhereInput = { role: Role.ADMIN, status: UserStatus.ACTIVE, deletedAt: null };

// Bangladesh time is always UTC+6 (no daylight saving)
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

// Start of the current month in Bangladesh time, as a normal Date.
// e.g. now = 21 Nov 2026 -> 1 Nov 2026 00:00 Dhaka = 31 Oct 2026 18:00 UTC
// (Using new Date(year, month, 1) would depend on the server's timezone,
//  and Vercel servers run in UTC.)
export const getDhakaMonthStart = (now: Date) => {
	const dhakaNow = new Date(now.getTime() + DHAKA_OFFSET_MS); // its UTC parts = Dhaka clock time
	return new Date(Date.UTC(dhakaNow.getUTCFullYear(), dhakaNow.getUTCMonth(), 1) - DHAKA_OFFSET_MS);
};

// ======================= 1. DASHBOARD STATS =======================
const getDashboardStats = async () => {
	const now = new Date();
	const startOfMonth = getDhakaMonthStart(now); // "this month" in Asia/Dhaka time
	const activeUser = { deletedAt: null };

	const [
		usersByRole,
		blockedUsers,
		zones,
		substations,
		feeders,
		areas,
		outagesByStatus,
		upcomingScheduled,
		reportsByStatus,
		assignmentsByStatus,
		totalRevenue,
		monthRevenue,
		unpaidBills,
	] = await Promise.all([
		prisma.user.groupBy({ by: ["role"], where: activeUser, _count: { _all: true } }),
		prisma.user.count({ where: { ...activeUser, status: UserStatus.BLOCKED } }),
		prisma.distributionZone.count({ where: activeUser }),
		prisma.substation.count({ where: activeUser }),
		prisma.feeder.count({ where: activeUser }),
		prisma.area.count({ where: activeUser }),
		prisma.outage.groupBy({ by: ["status"], where: activeUser, _count: { _all: true } }),
		prisma.outage.count({ where: { ...activeUser, status: OutageStatus.SCHEDULED, startTime: { gt: now } } }),
		prisma.outageReport.groupBy({ by: ["status"], _count: { _all: true } }),
		prisma.technicianAssignment.groupBy({ by: ["status"], _count: { _all: true } }),
		prisma.payment.aggregate({ where: { status: PaymentStatus.SUCCESS }, _sum: { amount: true }, _count: true }),
		prisma.payment.aggregate({
			where: { status: PaymentStatus.SUCCESS, paidAt: { gte: startOfMonth } },
			_sum: { amount: true },
			_count: true,
		}),
		prisma.bill.aggregate({ where: { status: BillStatus.UNPAID }, _sum: { amount: true }, _count: true }),
	]);

	const roles = usersByRole.map((row) => ({ status: row.role, _count: row._count }));
	const reports = toCountMap(Object.values(ReportStatus), reportsByStatus);

	return {
		users: {
			...toCountMap(Object.values(Role), roles),
			total: usersByRole.reduce((sum, row) => sum + row._count._all, 0),
			blocked: blockedUsers,
		},
		network: { zones, substations, feeders, areas },
		outages: {
			...toCountMap(Object.values(OutageStatus), outagesByStatus),
			upcomingScheduled,
		},
		reports: {
			...reports,
			open: reports.PENDING + reports.UNDER_REVIEW + reports.ASSIGNED + reports.IN_PROGRESS,
		},
		assignments: toCountMap(Object.values(AssignmentStatus), assignmentsByStatus),
		payments: {
			successfulPayments: totalRevenue._count,
			totalRevenue: Number(totalRevenue._sum.amount ?? 0),
			thisMonthPayments: monthRevenue._count,
			thisMonthRevenue: Number(monthRevenue._sum.amount ?? 0),
			unpaidBills: unpaidBills._count,
			unpaidAmount: Number(unpaidBills._sum.amount ?? 0),
		},
	};
};

// ======================= 2. USERS LIST =======================
const getAllUsers = async (query: IUsersQuery) => {
	const { page, limit, sortBy, sortOrder, role, status, areaId, searchTerm } = query;

	const where: UserWhereInput = { deletedAt: null };
	if (role) where.role = role;
	if (status) where.status = status;
	if (areaId) where.areaId = areaId;

	if (searchTerm) {
		const contains = { contains: searchTerm, mode: "insensitive" as const };
		where.OR = [{ name: contains }, { email: contains }, { phone: contains }, { meterNumber: contains }];
	}

	const [users, total] = await Promise.all([
		prisma.user.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			omit: safeUserOmit, // never send password / refresh token hash
			include: { area: { select: { id: true, name: true, code: true } } },
		}),
		prisma.user.count({ where }),
	]);

	return { data: users, meta: buildMeta(page, limit, total) };
};

// ======================= 3. CREATE TECHNICIAN =======================
const createTechnician = async (payload: ICreateTechnicianPayload, admin: RequestUser) => {
	const existing = await prisma.user.findUnique({ where: { email: payload.email } });

	if (existing) {
		throw new AppError(httpStatus.CONFLICT, "An account with this email already exists");
	}

	const hashedPassword = await bcrypt.hash(payload.password, config.bcrypt_salt_rounds);

	return prisma.$transaction(async (tx) => {
		const technician = await tx.user.create({
			data: { ...payload, password: hashedPassword, role: Role.TECHNICIAN },
			omit: safeUserOmit,
		});

		await createAuditLog(tx, {
			userId: admin.userId,
			action: "TECHNICIAN_CREATED",
			entityType: "User",
			entityId: technician.id,
			details: { email: technician.email, name: technician.name },
		});

		return technician;
	});
};

// Loads a user that is not deleted, or throws 404
const findTargetUser = async (id: string) => {
	const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	return user;
};

// ======================= 4. CHANGE ROLE =======================
const changeRole = async (id: string, payload: IChangeRolePayload, admin: RequestUser) => {
	if (id === admin.userId) {
		throw new AppError(httpStatus.FORBIDDEN, "You can't change your own role");
	}

	const user = await findTargetUser(id);

	if (user.role === payload.role) {
		throw new AppError(httpStatus.BAD_REQUEST, `User is already ${payload.role}`);
	}

	// A technician with unfinished jobs must hand them over first
	if (user.role === Role.TECHNICIAN) {
		const activeJobs = await prisma.technicianAssignment.count({
			where: {
				technicianId: id,
				status: { in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED, AssignmentStatus.IN_PROGRESS] },
			},
		});

		if (activeJobs > 0) {
			throw new AppError(
				httpStatus.CONFLICT,
				`This technician has ${activeJobs} unfinished job(s). Reassign them before changing the role.`,
			);
		}
	}

	// Serializable: if two admins change admins at the same moment,
	// PostgreSQL cancels one of them, so we never end up with zero admins.
	const updated = await prisma.$transaction(
		async (tx) => {
			if (user.role === Role.ADMIN) {
				const otherActiveAdmins = await tx.user.count({ where: { ...activeAdminWhere, NOT: { id } } });

				if (otherActiveAdmins === 0) {
					throw new AppError(httpStatus.CONFLICT, "Cannot demote the last active admin");
				}
			}

			const result = await tx.user.update({
				where: { id },
				// Clearing the refresh token logs the user out, so they log in again with the new role
				data: { role: payload.role, refreshTokenHash: null },
				omit: safeUserOmit,
			});

			await notifyUser(tx, id, {
				title: "Your role has changed",
				message: `Your account role is now ${payload.role}. Please log in again.`,
				type: NotificationType.GENERAL,
			});

			await createAuditLog(tx, {
				userId: admin.userId,
				action: "USER_ROLE_CHANGED",
				entityType: "User",
				entityId: id,
				details: { email: user.email, oldRole: user.role, newRole: payload.role },
			});

			return result;
		},
		{ isolationLevel: "Serializable" },
	);

	return updated;
};

// ======================= 5. BLOCK / UNBLOCK =======================
const changeStatus = async (id: string, payload: IChangeStatusPayload, admin: RequestUser) => {
	if (id === admin.userId) {
		throw new AppError(httpStatus.FORBIDDEN, "You can't block or unblock yourself");
	}

	const user = await findTargetUser(id);

	if (user.status === payload.status) {
		throw new AppError(httpStatus.BAD_REQUEST, `User is already ${payload.status}`);
	}

	const isBlocking = payload.status === UserStatus.BLOCKED;

	const updated = await prisma.$transaction(
		async (tx) => {
			if (isBlocking && user.role === Role.ADMIN) {
				const otherActiveAdmins = await tx.user.count({ where: { ...activeAdminWhere, NOT: { id } } });

				if (otherActiveAdmins === 0) {
					throw new AppError(httpStatus.CONFLICT, "Cannot block the last active admin");
				}
			}

			const data: Prisma.UserUpdateInput = { status: payload.status };

			// Blocking also ends the user's session right away
			if (isBlocking) {
				data.refreshTokenHash = null;
			}

			const result = await tx.user.update({ where: { id }, data, omit: safeUserOmit });

			await createAuditLog(tx, {
				userId: admin.userId,
				action: isBlocking ? "USER_BLOCKED" : "USER_UNBLOCKED",
				entityType: "User",
				entityId: id,
				details: { email: user.email, role: user.role },
			});

			return result;
		},
		{ isolationLevel: "Serializable" },
	);

	return updated;
};

// ======================= 6. AUDIT LOGS =======================
const getAuditLogs = async (query: IAuditLogQuery) => {
	const { page, limit, sortOrder, action, entityType, entityId, userId, from, to } = query;

	const where: AuditLogWhereInput = {};
	if (action) where.action = action;
	if (entityType) where.entityType = { equals: entityType, mode: "insensitive" };
	if (entityId) where.entityId = entityId;
	if (userId) where.userId = userId;

	if (from || to) {
		where.createdAt = {
			...(from ? { gte: from } : {}),
			...(to ? { lte: to } : {}),
		};
	}

	const [logs, total] = await Promise.all([
		prisma.auditLog.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { createdAt: sortOrder },
			include: { user: { select: { id: true, name: true, email: true, role: true } } },
		}),
		prisma.auditLog.count({ where }),
	]);

	return { data: logs, meta: buildMeta(page, limit, total) };
};

export const AdminService = {
	getDashboardStats,
	getAllUsers,
	createTechnician,
	changeRole,
	changeStatus,
	getAuditLogs,
};
