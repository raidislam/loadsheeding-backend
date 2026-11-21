// Run manually with: npm run seed
import { prisma } from "../lib/prisma";
import { seedAdmin } from "../utils/seed";

const run = async () => {
	try {
		await seedAdmin();
	} catch (error) {
		console.error("Admin seed failed:", error);
		process.exitCode = 1;
	} finally {
		await prisma.$disconnect();
	}
};

run();
