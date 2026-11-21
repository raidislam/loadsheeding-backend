import type { Role, UserStatus } from "../../../generated/prisma/enums";

export interface ICreateTechnicianPayload {
	name: string;
	email: string;
	password: string;
	phone?: string;
	address?: string;
}

export interface IChangeRolePayload {
	role: Role;
}

export interface IChangeStatusPayload {
	status: UserStatus;
}

export interface IUsersQuery {
	page: number;
	limit: number;
	sortBy: "createdAt" | "name" | "email";
	sortOrder: "asc" | "desc";
	role?: Role;
	status?: UserStatus;
	areaId?: string;
	searchTerm?: string;
}

export interface IAuditLogQuery {
	page: number;
	limit: number;
	sortOrder: "asc" | "desc";
	action?: string;
	entityType?: string;
	entityId?: string;
	userId?: string;
	from?: Date;
	to?: Date;
}
