import type { OutageStatus, OutageType } from "../../../generated/prisma/enums";

export interface ICreateOutagePayload {
	title: string;
	type: OutageType;
	areaId: string;
	startTime: Date;
	expectedRestoreTime: Date;
	reason: string;
	description?: string;
}

export interface IUpdateOutagePayload {
	title?: string;
	reason?: string;
	description?: string;
	startTime?: Date;
	expectedRestoreTime?: Date;
	status?: OutageStatus;
}

export interface IOutageQuery {
	page: number;
	limit: number;
	sortBy: "startTime" | "expectedRestoreTime" | "createdAt" | "status";
	sortOrder: "asc" | "desc";
	status?: OutageStatus;
	type?: OutageType;
	areaId?: string;
	feederId?: string;
	substationId?: string;
	zoneId?: string;
	from?: Date;
	to?: Date;
}

export interface IOutageSearchQuery {
	q: string;
	page: number;
	limit: number;
}
