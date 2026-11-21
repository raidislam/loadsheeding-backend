import httpStatus from "http-status";
import type { FeederWhereInput } from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { buildMeta, getSkip } from "../../utils/pagination";
import type { ICreateFeederPayload, IFeederQuery, IUpdateFeederPayload } from "./feeder.interface";

// Feeder with its parents: substation -> zone
const feederParents = {
	substation: {
		select: {
			id: true,
			name: true,
			code: true,
			zone: { select: { id: true, name: true, code: true } },
		},
	},
};

const findActiveFeeder = async (id: string) => {
	const feeder = await prisma.feeder.findFirst({
		where: { id, deletedAt: null },
	});

	if (!feeder) {
		throw new AppError(httpStatus.NOT_FOUND, "Feeder not found");
	}

	return feeder;
};

const checkSubstationExists = async (substationId: string) => {
	const substation = await prisma.substation.findFirst({
		where: { id: substationId, deletedAt: null },
	});

	if (!substation) {
		throw new AppError(httpStatus.NOT_FOUND, "Substation not found");
	}
};

const checkDuplicateCode = async (code: string, excludeId?: string) => {
	const notSelf = excludeId ? { NOT: { id: excludeId } } : {};

	const codeUsed = await prisma.feeder.findFirst({
		where: { code, ...notSelf },
	});

	if (codeUsed) {
		throw new AppError(httpStatus.CONFLICT, `Feeder code "${code}" already exists`);
	}
};

const createFeeder = async (payload: ICreateFeederPayload) => {
	await checkSubstationExists(payload.substationId);
	await checkDuplicateCode(payload.code);

	return prisma.feeder.create({
		data: payload,
		include: feederParents,
	});
};

const getAllFeeders = async (query: IFeederQuery) => {
	const { page, limit, sortBy, sortOrder, searchTerm, substationId, zoneId } = query;

	const where: FeederWhereInput = { deletedAt: null };

	if (substationId) {
		where.substationId = substationId;
	}

	// filter by zone through the substation relation
	if (zoneId) {
		where.substation = { zoneId };
	}

	if (searchTerm) {
		where.OR = [
			{ name: { contains: searchTerm, mode: "insensitive" } },
			{ code: { contains: searchTerm, mode: "insensitive" } },
		];
	}

	const [feeders, total] = await Promise.all([
		prisma.feeder.findMany({
			where,
			skip: getSkip(page, limit),
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			include: {
				...feederParents,
				_count: { select: { areas: { where: { deletedAt: null } } } },
			},
		}),
		prisma.feeder.count({ where }),
	]);

	return { data: feeders, meta: buildMeta(page, limit, total) };
};

const getSingleFeeder = async (id: string) => {
	const feeder = await prisma.feeder.findFirst({
		where: { id, deletedAt: null },
		include: {
			...feederParents,
			areas: {
				where: { deletedAt: null },
				select: { id: true, name: true, code: true },
				orderBy: { name: "asc" },
			},
		},
	});

	if (!feeder) {
		throw new AppError(httpStatus.NOT_FOUND, "Feeder not found");
	}

	return feeder;
};

const updateFeeder = async (id: string, payload: IUpdateFeederPayload) => {
	await findActiveFeeder(id);

	if (payload.substationId) {
		await checkSubstationExists(payload.substationId);
	}

	if (payload.code) {
		await checkDuplicateCode(payload.code, id);
	}

	return prisma.feeder.update({
		where: { id },
		data: payload,
		include: feederParents,
	});
};

const deleteFeeder = async (id: string) => {
	await findActiveFeeder(id);

	const activeAreas = await prisma.area.count({
		where: { feederId: id, deletedAt: null },
	});

	if (activeAreas > 0) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Cannot delete: this feeder still has ${activeAreas} active area(s). Delete them first.`,
		);
	}

	return prisma.feeder.update({
		where: { id },
		data: { deletedAt: new Date() },
		select: { id: true, name: true, code: true, deletedAt: true },
	});
};

export const FeederService = {
	createFeeder,
	getAllFeeders,
	getSingleFeeder,
	updateFeeder,
	deleteFeeder,
};
