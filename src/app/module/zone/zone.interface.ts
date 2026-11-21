export interface ICreateZonePayload {
	name: string;
	code: string;
	description?: string;
}

export type IUpdateZonePayload = Partial<ICreateZonePayload>;

export interface IZoneQuery {
	page: number;
	limit: number;
	sortBy: "name" | "code" | "createdAt";
	sortOrder: "asc" | "desc";
	searchTerm?: string;
}
