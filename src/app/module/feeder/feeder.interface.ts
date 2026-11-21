export interface ICreateFeederPayload {
	name: string;
	code: string;
	substationId: string;
	voltageKV?: number;
}

export type IUpdateFeederPayload = Partial<ICreateFeederPayload>;

export interface IFeederQuery {
	page: number;
	limit: number;
	sortBy: "name" | "code" | "createdAt";
	sortOrder: "asc" | "desc";
	searchTerm?: string;
	substationId?: string;
	zoneId?: string;
}
