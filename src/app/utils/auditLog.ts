import type { Prisma } from "../../generated/prisma/client";

type TAuditLog = {
	userId?: string | null; // who did it (null = system)
	action: string; // e.g. "OUTAGE_CREATED"
	entityType: string; // e.g. "Outage"
	entityId?: string;
	details?: Prisma.InputJsonValue; // any extra info
};

// Pass `tx` (the transaction client) so the log is saved in the SAME
// transaction as the main operation: if one fails, both are rolled back.
export const createAuditLog = async (tx: Prisma.TransactionClient, log: TAuditLog) => {
	await tx.auditLog.create({
		data: {
			userId: log.userId ?? null,
			action: log.action,
			entityType: log.entityType,
			entityId: log.entityId,
			details: log.details,
		},
	});
};
