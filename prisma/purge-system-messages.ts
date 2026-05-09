/**
 * One-shot cleanup: drop every isSystem=true Message produced by earlier
 * iterations of the system-message wording (so old + new + duplicate notices
 * all go away). Re-running session changes will recreate fresh, canonical
 * notices in the new sessions.
 *
 * Run once:
 *   npx ts-node prisma/purge-system-messages.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.message.deleteMany({
    where: { isSystem: true },
  });
  console.log(`Deleted ${result.count} system message(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
