import bcrypt from "bcryptjs";
import { Role } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";

// Creates the first ADMIN account from .env values.
// Safe to run many times: if the admin email already exists, nothing is created.
export const seedAdmin = async () => {
	const name = config.admin_name;
	const email = config.admin_email?.trim().toLowerCase();
	const password = config.admin_password;

	// Credentials must come from .env, never hardcoded
	if (!name || !email || !password) {
		console.warn("Admin seed skipped: ADMIN_NAME, ADMIN_EMAIL or ADMIN_PASSWORD missing in .env");
		return;
	}

	const existingUser = await prisma.user.findUnique({ where: { email } });

	if (existingUser) {
		if (existingUser.role !== Role.ADMIN) {
			console.warn(`Admin seed skipped: ${email} already exists with role ${existingUser.role}`);
		} else {
			console.log("Admin already exists. Seed skipped.");
		}
		return;
	}

	const hashedPassword = await bcrypt.hash(password, config.bcrypt_salt_rounds);

	const admin = await prisma.user.create({
		data: {
			name,
			email,
			password: hashedPassword,
			role: Role.ADMIN,
		},
		select: { id: true, name: true, email: true, role: true },
	});

	console.log("Admin created:", admin);
};
