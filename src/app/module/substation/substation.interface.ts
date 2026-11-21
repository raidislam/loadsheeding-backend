export interface ICreateSubstationPayload {
	name: string;
	code: string;
	zoneId: string;
	capacityMW?: number;
	address?: string;
}

export type IUpdateSubstationPayload = Partial<ICreateSubstationPayload>;

export interface ISubstationQuery {
	page: number;
	limit: number;
	sortBy: "name" | "code" | "capacityMW" | "createdAt";
	sortOrder: "asc" | "desc";
	searchTerm?: string;
	zoneId?: string;
}
