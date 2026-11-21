import app from "./app";
import config from "./app/config";
import { prisma } from "./app/lib/prisma";
import { seedAdmin } from "./app/utils/seed";

const main = async () => {
	try {
		await prisma.$connect();
		console.log("Connected to the database successfully.");

		// Create the first admin from .env (skipped if it already exists)
		await seedAdmin();

		app.listen(config.port, () => {
			console.log(`Server is running on port ${config.port}`);
		});
	} catch (error) {
		console.error("Error starting the server:", error);
		await prisma.$disconnect();
		process.exit(1);
	}
};

main();
