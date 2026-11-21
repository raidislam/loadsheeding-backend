import httpStatus from "http-status";
import { OutageStatus, ReportStatus } from "../../../generated/prisma/enums";
import type { AreaWhereInput } from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { buildMeta, getSkip } from "../../utils/pagination";
import type { IAreaQuery, ICreateAreaPayload, IUpdateAreaPayload } from "./area.interface";

// Area with its full network path: feeder -> substation -> zone
export const areaParents = {
	feeder: {
		select: {
			id: true,
			name: true,
			code: true,
			substation: {
				select: {
					id: true,
					name: true,
					code: true,
					zone: { select: { id: true, name: true, code: true } },
				},
			},
		},
	},
};

const findActiveArea = async (id: string) => {
	const area = await prisma.area.findFirst({
		where: { id, deletedAt: null },
	});

	if (!area) {
		throw new AppError(httpStatus.NOT_FOUND, "Area not found");
	}

	return area;
};

const checkFeederExists = async (feederId: string) => {
	const feeder = await prisma.feeder.findFirst({
		where: { id: feederId, deletedAt: null },
	});

	if (!feeder) {
		throw new AppError(httpStatus.NOT_FOUND, "Feeder not found");
	}
};

const checkDuplicateCode = async (code: string, excludeId?: string) => {
	const notSelf = excludeId ? { NOT: { id: excludeId } } : {};

	const codeUsed = await prisma.area.findFirst({
		where: { code, ...notSelf },
	});

	if (codeUsed) {
		throw new AppError(httpStatus.CONFLICT, `Area code "${code}" already exists`);
	}
};

const createArea = async (payload: ICreateAreaPayload) => {
	await checkFeederExists(payload.feederId);
	await checkDuplicateCode(payload.code);

	return prisma.area.create({
		data: payload,
		include: areaParents,
	});
};

const getAllAreas = async (query: IAreaQuery) => {
	const { page, limit, sortBy, sortOrder, searchTerm, feederId, substationId, zoneId } = query;

	const where: AreaWhereInput = { deletedAt: null };

	if (feederId) {
		where.feederId = feederId;
	}

	// Filter by substation / zone through the relations
	if (substationId || zoneId) {
		where.feeder = {
			...(substationId ? { substationId } : {}),
			...(zoneId ? { substation: { zoneId } } : {}),
		};
	}

	// Search by area name / code, or by the feeder / substation / zone name
	if (searchTerm) {
		where.OR = [
			{ name: { contains: searchTerm, mode: "insensitive" } },
			{ code: { contains: searchTerm, mode: "insensitive" } },
			{ feeder: { name: { contains: searchTerm, mode: "insensitive" } } },
			{ feeder: { substation: { name: { contains: searchTerm, mode: "insensitive" } } } },
			{ feeder: { substation: { zone: { name: { contains: searchTerm, mode: "insensitive" } } } } },
		];
	}

	const [areas, total] = await Promise.all([
		prisma.area.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			include: areaParents,
		}),
		prisma.area.count({ where }),
	]);

	return { data: areas, meta: buildMeta(page, limit, total) };
};

const getSingleArea = async (id: string) => {
	const area = await prisma.area.findFirst({
		where: { id, deletedAt: null },
		include: {
			...areaParents,
			_count: {
				select: {
					customers: { where: { deletedAt: null } },
					outages: { where: { deletedAt: null } },
				},
			},
		},
	});

	if (!area) {
		throw new AppError(httpStatus.NOT_FOUND, "Area not found");
	}

	return area;
};

const updateArea = async (id: string, payload: IUpdateAreaPayload) => {
	await findActiveArea(id);

	if (payload.feederId) {
		await checkFeederExists(payload.feederId);
	}

	if (payload.code) {
		await checkDuplicateCode(payload.code, id);
	}

	return prisma.area.update({
		where: { id },
		data: payload,
		include: areaParents,
	});
};

const deleteArea = async (id: string) => {
	await findActiveArea(id);

	// An area can't be deleted while it is still in use
	const [customers, activeOutages, openReports] = await Promise.all([
		prisma.user.count({ where: { areaId: id, deletedAt: null } }),
		prisma.outage.count({
			where: {
				areaId: id,
				deletedAt: null,
				status: { in: [OutageStatus.SCHEDULED, OutageStatus.ONGOING] },
			},
		}),
		prisma.outageReport.count({
			where: {
				areaId: id,
				status: { notIn: [ReportStatus.RESOLVED, ReportStatus.REJECTED] },
			},
		}),
	]);

	if (customers > 0 || activeOutages > 0 || openReports > 0) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Cannot delete: this area still has ${customers} customer(s), ${activeOutages} active outage(s) and ${openReports} open report(s).`,
		);
	}

	return prisma.area.update({
		where: { id },
		data: { deletedAt: new Date() },
		select: { id: true, name: true, code: true, deletedAt: true },
	});
};

export const AreaService = {
	createArea,
	getAllAreas,
	getSingleArea,
	updateArea,
	deleteArea,
};
