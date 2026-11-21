import { z } from "zod";

// Reusable field rules (also used by the user module)
export const emailField = z
	.string("Email is required")
	.trim()
	.toLowerCase()
	.pipe(z.email("Invalid email address"));

export const passwordField = z
	.string("Password is required")
	.min(8, "Password must be at least 8 characters")
	.max(64, "Password cannot exceed 64 characters")
	.regex(/[A-Za-z]/, "Password must contain at least one letter")
	.regex(/[0-9]/, "Password must contain at least one number");

// Bangladeshi mobile number, e.g. 01712345678
export const phoneField = z
	.string()
	.trim()
	.regex(/^01[3-9]\d{8}$/, "Phone must be a valid Bangladeshi number (e.g. 01712345678)");

export const meterNumberField = z
	.string()
	.trim()
	.min(5, "Meter number must be at least 5 characters")
	.max(20, "Meter number cannot exceed 20 characters");

// Note: there is no "role" field. Anything extra in the body (like role: "ADMIN")
// is removed by Zod, so registration always creates a CUSTOMER.
const RegisterZodSchema = z.object({
	name: z.string("Name is required").trim().min(2, "Name must be at least 2 characters").max(100),
	email: emailField,
	password: passwordField,
	phone: phoneField.optional(),
	address: z.string().trim().min(3, "Address is too short").max(255).optional(),
	meterNumber: meterNumberField.optional(),
	areaId: z.uuid("Invalid area id").optional(),
});

const LoginZodSchema = z.object({
	email: emailField,
	password: z.string("Password is required").min(1, "Password is required"),
});

const RefreshTokenZodSchema = z.object({
	refreshToken: z.string("Refresh token is required").min(1, "Refresh token is required"),
});

export const AuthValidation = {
	RegisterZodSchema,
	LoginZodSchema,
	RefreshTokenZodSchema,
};
