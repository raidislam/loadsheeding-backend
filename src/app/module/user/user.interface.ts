export interface IUpdateMyProfilePayload {
	name?: string;
	phone?: string;
	address?: string;
	meterNumber?: string; // customer only
	areaId?: string; // customer only
}

export interface IChangePasswordPayload {
	currentPassword: string;
	newPassword: string;
}
