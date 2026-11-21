import httpStatus from "http-status";
import {
	AssignmentStatus,
	NotificationType,
	OutageStatus,
	ReportStatus,
	Role,
	UserStatus,
} from "../../../generated/prisma/enums";
import type { TechnicianAssignmentWhereInput } from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { createAuditLog } from "../../utils/auditLog";
import { notifyAdmins, notifyAreaCustomers, notifyUser } from "../../utils/notification";
import { buildMeta, getSkip } from "../../utils/pagination";
import { areaParents } from "../area/area.service";
import type {
	IAssignmentQuery,
	ICreateAssignmentPayload,
	IMyJobsQuery,
	IRepairReportPayload,
	IUpdateAssignmentStatusPayload,
} from "./assignment.interface";

// Status workflow: ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
// (IN_PROGRESS -> COMPLETED happens only through the repair report)
const nextStatus: Record<AssignmentStatus, AssignmentStatus | null> = {
	ASSIGNED: AssignmentStatus.ACCEPTED,
	ACCEPTED: AssignmentStatus.IN_PROGRESS,
	IN_PROGRESS: AssignmentStatus.COMPLETED,
	COMPLETED: null,
};

// Admin must review a report first (PENDING -> UNDER_REVIEW) before assigning
const ASSIGNABLE_REPORT_STATUSES: ReportStatus[] = [ReportStatus.UNDER_REVIEW];

// A technician can be replaced only before the work has started
const REASSIGNABLE_JOB_STATUSES: AssignmentStatus[] = [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED];

const ACTIVE_JOB_STATUSES: AssignmentStatus[] = [
	AssignmentStatus.ASSIGNED,
	AssignmentStatus.ACCEPTED,
	AssignmentStatus.IN_PROGRESS,
];

// Details used by job lists and job details
const jobInclude = {
	report: {
		select: {
			id: true,
			title: true,
			description: true,
			address: true,
			status: true,
			createdAt: true,
			area: { select: { id: true, name: true, code: true, ...areaParents } },
			customer: { select: { id: true, name: true, phone: true } },
		},
	},
	technician: { select: { id: true, name: true, phone: true } },
	assignedBy: { select: { id: true, name: true } },
	repairRecords: { orderBy: { createdAt: "desc" as const } },
};

// Loads a job and makes sure a technician only touches their own job
const findJobForUser = async (id: string, user: RequestUser) => {
	const assignment = await prisma.technicianAssignment.findUnique({
		where: { id },
		include: { report: { include: { area: { select: { name: true } } } } },
	});

	if (!assignment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assignment not found");
	}

	if (user.role === Role.TECHNICIAN && assignment.technicianId !== user.userId) {
		throw new AppError(httpStatus.FORBIDDEN, "This job is not assigned to you");
	}

	return assignment;
};

// The technician must exist, have the TECHNICIAN role, and be ACTIVE
const findActiveTechnician = async (technicianId: string) => {
	const technician = await prisma.user.findFirst({
		where: { id: technicianId, deletedAt: null },
	});

	if (!technician || technician.role !== Role.TECHNICIAN) {
		throw new AppError(httpStatus.NOT_FOUND, "Technician not found");
	}

	if (technician.status !== UserStatus.ACTIVE) {
		throw new AppError(httpStatus.BAD_REQUEST, "This technician's account is blocked");
	}

	return technician;
};

// ---------------- Admin ----------------

const createAssignment = async (payload: ICreateAssignmentPayload, admin: RequestUser) => {
	const report = await prisma.outageReport.findUnique({
		where: { id: payload.reportId },
		include: { assignment: true, area: { select: { name: true } } },
	});

	if (!report) {
		throw new AppError(httpStatus.NOT_FOUND, "Report not found");
	}

	if (report.assignment) {
		throw new AppError(httpStatus.CONFLICT, "A technician is already assigned to this report");
	}

	if (!ASSIGNABLE_REPORT_STATUSES.includes(report.status)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Only UNDER_REVIEW reports can be assigned (this one is ${report.status}). Review the report first.`,
		);
	}

	const technician = await findActiveTechnician(payload.technicianId);

	const assignmentId = await prisma.$transaction(async (tx) => {
		// Change the report status only if it is still assignable.
		// If another admin assigned it a moment ago, count will be 0.
		const reportUpdate = await tx.outageReport.updateMany({
			where: { id: report.id, status: { in: ASSIGNABLE_REPORT_STATUSES } },
			data: { status: ReportStatus.ASSIGNED },
		});

		if (reportUpdate.count === 0) {
			throw new AppError(httpStatus.CONFLICT, "This report was just changed by someone else. Please refresh.");
		}

		// reportId is @unique in the schema, so a report can never get two assignments
		const assignment = await tx.technicianAssignment.create({
			data: {
				reportId: report.id,
				technicianId: technician.id,
				assignedById: admin.userId,
				note: payload.note,
			},
		});

		await notifyUser(tx, technician.id, {
			title: "New job assigned",
			message: `You have a new repair job in ${report.area.name}: "${report.title}"`,
			type: NotificationType.JOB_ASSIGNED,
		});

		await notifyUser(tx, report.customerId, {
			title: "Technician assigned",
			message: `Technician ${technician.name} has been assigned to your report "${report.title}".`,
			type: NotificationType.REPORT_UPDATE,
		});

		await createAuditLog(tx, {
			userId: admin.userId,
			action: "TECHNICIAN_ASSIGNED",
			entityType: "TechnicianAssignment",
			entityId: assignment.id,
			details: { reportId: report.id, technicianId: technician.id, technicianName: technician.name },
		});

		return assignment.id;
	});

	// Read the full job AFTER the transaction (keeps the transaction short)
	return prisma.technicianAssignment.findUnique({ where: { id: assignmentId }, include: jobInclude });
};

// Replace the technician of a job that has not started yet (ASSIGNED / ACCEPTED).
// The job goes back to ASSIGNED for the new technician.
const reassignTechnician = async (id: string, technicianId: string, admin: RequestUser) => {
	const assignment = await prisma.technicianAssignment.findUnique({
		where: { id },
		include: { report: { select: { title: true, customerId: true } }, technician: { select: { name: true } } },
	});

	if (!assignment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assignment not found");
	}

	if (!REASSIGNABLE_JOB_STATUSES.includes(assignment.status)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Technician can only be changed before work starts (job is ${assignment.status})`,
		);
	}

	if (assignment.technicianId === technicianId) {
		throw new AppError(httpStatus.BAD_REQUEST, "This technician is already assigned to the job");
	}

	const newTechnician = await findActiveTechnician(technicianId);

	await prisma.$transaction(async (tx) => {
		// Only change it if nothing changed since we checked
		const result = await tx.technicianAssignment.updateMany({
			where: { id, technicianId: assignment.technicianId, status: { in: REASSIGNABLE_JOB_STATUSES } },
			data: {
				technicianId: newTechnician.id,
				assignedById: admin.userId,
				status: AssignmentStatus.ASSIGNED,
				assignedAt: new Date(),
				acceptedAt: null,
			},
		});

		if (result.count === 0) {
			throw new AppError(httpStatus.CONFLICT, "This job was just changed by someone else. Please refresh.");
		}

		await notifyUser(tx, newTechnician.id, {
			title: "New job assigned",
			message: `You have been assigned the job "${assignment.report.title}".`,
			type: NotificationType.JOB_ASSIGNED,
		});

		await notifyUser(tx, assignment.technicianId, {
			title: "Job reassigned",
			message: `The job "${assignment.report.title}" has been given to another technician.`,
			type: NotificationType.GENERAL,
		});

		await notifyUser(tx, assignment.report.customerId, {
			title: "Technician changed",
			message: `Technician ${newTechnician.name} is now handling your report "${assignment.report.title}".`,
			type: NotificationType.REPORT_UPDATE,
		});

		await createAuditLog(tx, {
			userId: admin.userId,
			action: "TECHNICIAN_REASSIGNED",
			entityType: "TechnicianAssignment",
			entityId: id,
			details: {
				oldTechnicianId: assignment.technicianId,
				oldTechnicianName: assignment.technician.name,
				newTechnicianId: newTechnician.id,
				newTechnicianName: newTechnician.name,
			},
		});
	});

	return prisma.technicianAssignment.findUnique({ where: { id }, include: jobInclude });
};

const getAllAssignments = async (query: IAssignmentQuery) => {
	const { page, limit, sortBy, sortOrder, status, technicianId, searchTerm } = query;

	const where: TechnicianAssignmentWhereInput = {};

	if (status) where.status = status;
	if (technicianId) where.technicianId = technicianId;

	// Search by technician name / email / phone or the report title
	if (searchTerm) {
		const contains = { contains: searchTerm, mode: "insensitive" as const };
		where.OR = [
			{ technician: { name: contains } },
			{ technician: { email: contains } },
			{ technician: { phone: contains } },
			{ report: { title: contains } },
		];
	}

	const [assignments, total] = await Promise.all([
		prisma.technicianAssignment.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			include: jobInclude,
		}),
		prisma.technicianAssignment.count({ where }),
	]);

	return { data: assignments, meta: buildMeta(page, limit, total) };
};

// ---------------- Admin + Technician ----------------

const getSingleAssignment = async (id: string, user: RequestUser) => {
	await findJobForUser(id, user);

	return prisma.technicianAssignment.findUnique({
		where: { id },
		include: jobInclude,
	});
};

// ---------------- Technician ----------------

const updateAssignmentStatus = async (
	id: string,
	payload: IUpdateAssignmentStatusPayload,
	technician: RequestUser,
) => {
	const assignment = await findJobForUser(id, technician);

	const expectedNext = nextStatus[assignment.status];

	if (payload.status !== expectedNext) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			expectedNext === AssignmentStatus.COMPLETED
				? "Job is IN_PROGRESS. Submit the repair report to complete it."
				: `Invalid status change: ${assignment.status} -> ${payload.status}.${expectedNext ? ` Next allowed status: ${expectedNext}` : " The job is already completed."}`,
		);
	}

	const isStarting = payload.status === AssignmentStatus.IN_PROGRESS;

	await prisma.$transaction(async (tx) => {
		// Update only if the status is still what we checked (protects against double clicks)
		const result = await tx.technicianAssignment.updateMany({
			where: { id, status: assignment.status },
			data: {
				status: payload.status,
				...(isStarting ? { startedAt: new Date() } : { acceptedAt: new Date() }),
			},
		});

		if (result.count === 0) {
			throw new AppError(httpStatus.CONFLICT, "Job status was already changed. Please refresh.");
		}

		// When work starts, the customer's report moves to IN_PROGRESS too
		if (isStarting) {
			await tx.outageReport.update({
				where: { id: assignment.reportId },
				data: { status: ReportStatus.IN_PROGRESS },
			});
		}

		await notifyUser(tx, assignment.report.customerId, {
			title: isStarting ? "Repair work started" : "Technician accepted your report",
			message: isStarting
				? `The technician has started repair work for "${assignment.report.title}".`
				: `The technician accepted the job for "${assignment.report.title}" and will start soon.`,
			type: NotificationType.REPORT_UPDATE,
		});

		await createAuditLog(tx, {
			userId: technician.userId,
			action: "ASSIGNMENT_STATUS_CHANGED",
			entityType: "TechnicianAssignment",
			entityId: id,
			details: { oldStatus: assignment.status, newStatus: payload.status },
		});
	});

	return prisma.technicianAssignment.findUnique({ where: { id }, include: jobInclude });
};

// Completes the job and restores power - everything in ONE transaction:
// 1. save the repair record          2. assignment -> COMPLETED
// 3. report -> RESOLVED + restoredAt  4. linked outage -> RESOLVED (if no other open reports)
// 5. notifications                    6. audit log
const submitRepairReport = async (id: string, payload: IRepairReportPayload, technician: RequestUser) => {
	const assignment = await findJobForUser(id, technician);

	if (assignment.status !== AssignmentStatus.IN_PROGRESS) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Repair report can only be submitted for an IN_PROGRESS job (this one is ${assignment.status})`,
		);
	}

	const restoredAt = payload.restoredAt ?? new Date();

	if (assignment.startedAt && restoredAt < assignment.startedAt) {
		throw new AppError(httpStatus.BAD_REQUEST, "restoredAt can't be before the job was started");
	}

	const report = assignment.report;

	const outageResolved = await prisma.$transaction(async (tx) => {
		// 2. Complete the job (only if still IN_PROGRESS -> stops duplicate submissions).
		//    Done first so a second, parallel submission fails immediately.
		const result = await tx.technicianAssignment.updateMany({
			where: { id, status: AssignmentStatus.IN_PROGRESS },
			data: { status: AssignmentStatus.COMPLETED, completedAt: new Date() },
		});

		if (result.count === 0) {
			throw new AppError(httpStatus.CONFLICT, "This job was already completed");
		}

		// 1. Save the repair record
		const repairRecord = await tx.repairRecord.create({
			data: {
				assignmentId: id,
				workDescription: payload.workDescription,
				partsUsed: payload.partsUsed,
				restoredAt,
			},
		});

		// 3. Customer's report is resolved
		await tx.outageReport.update({
			where: { id: report.id },
			data: { status: ReportStatus.RESOLVED, restoredAt },
		});

		// 4. If the report is linked to an ONGOING outage and no other linked
		//    report is still open, the whole outage is resolved.
		let outageResolved = false;

		if (report.outageId) {
			const outage = await tx.outage.findUnique({ where: { id: report.outageId } });

			const otherOpenReports = await tx.outageReport.count({
				where: {
					outageId: report.outageId,
					status: { notIn: [ReportStatus.RESOLVED, ReportStatus.REJECTED] },
				},
			});

			if (outage && outage.status === OutageStatus.ONGOING && !outage.deletedAt && otherOpenReports === 0) {
				await tx.outage.update({
					where: { id: outage.id },
					data: { status: OutageStatus.RESOLVED, actualRestoreTime: restoredAt },
				});

				await notifyAreaCustomers(tx, outage.areaId, {
					title: `Power restored - ${report.area.name}`,
					message: `Power has been restored in ${report.area.name}.`,
					type: NotificationType.POWER_RESTORED,
				});

				outageResolved = true;
			}
		}

		// 5. Notifications
		await notifyUser(tx, report.customerId, {
			title: "Power restored",
			message: `Your report "${report.title}" has been resolved. Power was restored.`,
			type: NotificationType.POWER_RESTORED,
		});

		await notifyAdmins(tx, {
			title: "Repair completed",
			message: `${technician.name} completed the repair for "${report.title}" in ${report.area.name}.`,
			type: NotificationType.REPORT_UPDATE,
		});

		// 6. Audit log
		await createAuditLog(tx, {
			userId: technician.userId,
			action: "REPAIR_COMPLETED",
			entityType: "TechnicianAssignment",
			entityId: id,
			details: {
				reportId: report.id,
				repairRecordId: repairRecord.id,
				restoredAt: restoredAt.toISOString(),
				outageResolved,
			},
		});

		return outageResolved;
	});

	const completedJob = await prisma.technicianAssignment.findUnique({ where: { id }, include: jobInclude });

	return { ...completedJob, outageResolved };
};

const getMyJobs = async (technician: RequestUser, query: IMyJobsQuery) => {
	const { page, limit, status } = query;

	const where: TechnicianAssignmentWhereInput = {
		technicianId: technician.userId,
		status: status ? status : { in: ACTIVE_JOB_STATUSES },
	};

	const [jobs, total] = await Promise.all([
		prisma.technicianAssignment.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { assignedAt: "asc" }, // oldest job first
			include: jobInclude,
		}),
		prisma.technicianAssignment.count({ where }),
	]);

	return { data: jobs, meta: buildMeta(page, limit, total) };
};

const getMyHistory = async (technician: RequestUser, query: { page: number; limit: number }) => {
	const { page, limit } = query;

	const where: TechnicianAssignmentWhereInput = {
		technicianId: technician.userId,
		status: AssignmentStatus.COMPLETED,
	};

	const [jobs, total] = await Promise.all([
		prisma.technicianAssignment.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { completedAt: "desc" }, // newest first
			include: jobInclude,
		}),
		prisma.technicianAssignment.count({ where }),
	]);

	return { data: jobs, meta: buildMeta(page, limit, total) };
};

export const AssignmentService = {
	createAssignment,
	reassignTechnician,
	getAllAssignments,
	getSingleAssignment,
	updateAssignmentStatus,
	submitRepairReport,
	getMyJobs,
	getMyHistory,
};
