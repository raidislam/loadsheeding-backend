import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({
	adapter,
	// Default transaction timeout is 5 seconds. Neon is a remote server, so a
	// transaction with many steps (e.g. repair report) can take longer.
	transactionOptions: {
		maxWait: 10000, // max time to wait for a free connection
		timeout: 20000, // max time the whole transaction may take
	},
});

export { prisma };
