import httpStatus from "http-status";
import type { DistributionZoneWhereInput } from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { buildMeta, getSkip } from "../../utils/pagination";
import type { ICreateZonePayload, IUpdateZonePayload, IZoneQuery } from "./zone.interface";

// Finds a zone that is NOT soft deleted, or throws 404
const findActiveZone = async (id: string) => {
	const zone = await prisma.distributionZone.findFirst({
		where: { id, deletedAt: null },
	});

	if (!zone) {
		throw new AppError(httpStatus.NOT_FOUND, "Zone not found");
	}

	return zone;
};

// name and code are unique in the DB (soft deleted rows included),
// so we check first to return a clear message.
const checkDuplicate = async (payload: IUpdateZonePayload, excludeId?: string) => {
	// When updating, ignore the zone itself
	const notSelf = excludeId ? { NOT: { id: excludeId } } : {};

	if (payload.code) {
		const codeUsed = await prisma.distributionZone.findFirst({
			where: { code: payload.code, ...notSelf },
		});
		if (codeUsed) {
			throw new AppError(httpStatus.CONFLICT, `Zone code "${payload.code}" already exists`);
		}
	}

	if (payload.name) {
		const nameUsed = await prisma.distributionZone.findFirst({
			where: { name: { equals: payload.name, mode: "insensitive" }, ...notSelf },
		});
		if (nameUsed) {
			throw new AppError(httpStatus.CONFLICT, `Zone name "${payload.name}" already exists`);
		}
	}
};

const createZone = async (payload: ICreateZonePayload) => {
	await checkDuplicate(payload);

	return prisma.distributionZone.create({ data: payload });
};

const getAllZones = async (query: IZoneQuery) => {
	const { page, limit, sortBy, sortOrder, searchTerm } = query;

	const where: DistributionZoneWhereInput = { deletedAt: null };

	if (searchTerm) {
		where.OR = [
			{ name: { contains: searchTerm, mode: "insensitive" } },
			{ code: { contains: searchTerm, mode: "insensitive" } },
		];
	}

	const [zones, total] = await Promise.all([
		prisma.distributionZone.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			include: {
				// number of active substations in each zone
				_count: { select: { substations: { where: { deletedAt: null } } } },
			},
		}),
		prisma.distributionZone.count({ where }),
	]);

	return { data: zones, meta: buildMeta(page, limit, total) };
};

const getSingleZone = async (id: string) => {
	const zone = await prisma.distributionZone.findFirst({
		where: { id, deletedAt: null },
		include: {
			substations: {
				where: { deletedAt: null },
				select: { id: true, name: true, code: true, capacityMW: true },
				orderBy: { name: "asc" },
			},
		},
	});

	if (!zone) {
		throw new AppError(httpStatus.NOT_FOUND, "Zone not found");
	}

	return zone;
};

const updateZone = async (id: string, payload: IUpdateZonePayload) => {
	await findActiveZone(id);
	await checkDuplicate(payload, id);

	return prisma.distributionZone.update({
		where: { id },
		data: payload,
	});
};

// Soft delete: the row stays in the DB, only deletedAt is set.
const deleteZone = async (id: string) => {
	await findActiveZone(id);

	const activeSubstations = await prisma.substation.count({
		where: { zoneId: id, deletedAt: null },
	});

	if (activeSubstations > 0) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Cannot delete: this zone still has ${activeSubstations} active substation(s). Delete them first.`,
		);
	}

	return prisma.distributionZone.update({
		where: { id },
		data: { deletedAt: new Date() },
		select: { id: true, name: true, code: true, deletedAt: true },
	});
};

export const ZoneService = {
	createZone,
	getAllZones,
	getSingleZone,
	updateZone,
	deleteZone,
};
