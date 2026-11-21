export interface IRegisterPayload {
	name: string;
	email: string;
	password: string;
	phone?: string;
	address?: string;
	meterNumber?: string;
	areaId?: string;
}

export interface ILoginPayload {
	email: string;
	password: string;
}

export interface IRefreshTokenPayload {
	refreshToken: string;
}
