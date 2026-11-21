import app from "./app";
import config from "./app/config";
import { prisma } from "./app/lib/prisma";
import { seedAdmin } from "./app/utils/seed";

// Stop early if JWT secrets are missing or weak.
// The two secrets must be different, otherwise a refresh token
// could be used as an access token.
const checkJwtSecrets = () => {
	const access = config.jwt_access_secret;
	const refresh = config.jwt_refresh_secret;

	if (!access || !refresh || access.length < 32 || refresh.length < 32) {
		throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set and at least 32 characters long");
	}

	if (access === refresh) {
		throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different");
	}
};

const main = async () => {
	try {
		checkJwtSecrets();

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
