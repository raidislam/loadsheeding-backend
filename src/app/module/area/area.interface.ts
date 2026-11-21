export interface ICreateAreaPayload {
	name: string;
	code: string;
	feederId: string;
}

export type IUpdateAreaPayload = Partial<ICreateAreaPayload>;

export interface IAreaQuery {
	page: number;
	limit: number;
	sortBy: "name" | "code" | "createdAt";
	sortOrder: "asc" | "desc";
	searchTerm?: string;
	feederId?: string;
	substationId?: string;
	zoneId?: string;
}
