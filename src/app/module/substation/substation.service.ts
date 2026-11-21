import httpStatus from "http-status";
import type { SubstationWhereInput } from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { buildMeta, getSkip } from "../../utils/pagination";
import type {
	ICreateSubstationPayload,
	ISubstationQuery,
	IUpdateSubstationPayload,
} from "./substation.interface";

const findActiveSubstation = async (id: string) => {
	const substation = await prisma.substation.findFirst({
		where: { id, deletedAt: null },
	});

	if (!substation) {
		throw new AppError(httpStatus.NOT_FOUND, "Substation not found");
	}

	return substation;
};

// The parent zone must exist and must not be deleted
const checkZoneExists = async (zoneId: string) => {
	const zone = await prisma.distributionZone.findFirst({
		where: { id: zoneId, deletedAt: null },
	});

	if (!zone) {
		throw new AppError(httpStatus.NOT_FOUND, "Zone not found");
	}
};

const checkDuplicateCode = async (code: string, excludeId?: string) => {
	const notSelf = excludeId ? { NOT: { id: excludeId } } : {};

	const codeUsed = await prisma.substation.findFirst({
		where: { code, ...notSelf },
	});

	if (codeUsed) {
		throw new AppError(httpStatus.CONFLICT, `Substation code "${code}" already exists`);
	}
};

const createSubstation = async (payload: ICreateSubstationPayload) => {
	await checkZoneExists(payload.zoneId);
	await checkDuplicateCode(payload.code);

	return prisma.substation.create({
		data: payload,
		include: { zone: { select: { id: true, name: true, code: true } } },
	});
};

const getAllSubstations = async (query: ISubstationQuery) => {
	const { page, limit, sortBy, sortOrder, searchTerm, zoneId } = query;

	const where: SubstationWhereInput = { deletedAt: null };

	if (zoneId) {
		where.zoneId = zoneId;
	}

	if (searchTerm) {
		where.OR = [
			{ name: { contains: searchTerm, mode: "insensitive" } },
			{ code: { contains: searchTerm, mode: "insensitive" } },
		];
	}

	const [substations, total] = await Promise.all([
		prisma.substation.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			include: {
				zone: { select: { id: true, name: true, code: true } },
				_count: { select: { feeders: { where: { deletedAt: null } } } },
			},
		}),
		prisma.substation.count({ where }),
	]);

	return { data: substations, meta: buildMeta(page, limit, total) };
};

const getSingleSubstation = async (id: string) => {
	const substation = await prisma.substation.findFirst({
		where: { id, deletedAt: null },
		include: {
			zone: { select: { id: true, name: true, code: true } },
			feeders: {
				where: { deletedAt: null },
				select: { id: true, name: true, code: true, voltageKV: true },
				orderBy: { name: "asc" },
			},
		},
	});

	if (!substation) {
		throw new AppError(httpStatus.NOT_FOUND, "Substation not found");
	}

	return substation;
};

const updateSubstation = async (id: string, payload: IUpdateSubstationPayload) => {
	await findActiveSubstation(id);

	if (payload.zoneId) {
		await checkZoneExists(payload.zoneId);
	}

	if (payload.code) {
		await checkDuplicateCode(payload.code, id);
	}

	return prisma.substation.update({
		where: { id },
		data: payload,
		include: { zone: { select: { id: true, name: true, code: true } } },
	});
};

const deleteSubstation = async (id: string) => {
	await findActiveSubstation(id);

	const activeFeeders = await prisma.feeder.count({
		where: { substationId: id, deletedAt: null },
	});

	if (activeFeeders > 0) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Cannot delete: this substation still has ${activeFeeders} active feeder(s). Delete them first.`,
		);
	}

	return prisma.substation.update({
		where: { id },
		data: { deletedAt: new Date() },
		select: { id: true, name: true, code: true, deletedAt: true },
	});
};

export const SubstationService = {
	createSubstation,
	getAllSubstations,
	getSingleSubstation,
	updateSubstation,
	deleteSubstation,
};
