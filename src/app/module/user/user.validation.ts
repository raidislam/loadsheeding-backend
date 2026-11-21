import { z } from "zod";
import { meterNumberField, passwordField, phoneField } from "../auth/auth.validation";

// email, role, status and password can NOT be changed here.
const UpdateMyProfileZodSchema = z
	.object({
		name: z.string().trim().min(2, "Name must be at least 2 characters").max(100).optional(),
		phone: phoneField.optional(),
		address: z.string().trim().min(3, "Address is too short").max(255).optional(),
		meterNumber: meterNumberField.optional(),
		areaId: z.uuid("Invalid area id").optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "Provide at least one field to update",
	});

const ChangePasswordZodSchema = z
	.object({
		currentPassword: z.string("Current password is required").min(1, "Current password is required"),
		newPassword: passwordField,
	})
	.refine((data) => data.currentPassword !== data.newPassword, {
		message: "New password must be different from the current password",
		path: ["newPassword"],
	});

export const UserValidation = {
	UpdateMyProfileZodSchema,
	ChangePasswordZodSchema,
};
