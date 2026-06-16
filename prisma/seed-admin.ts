/**
 * Interactive admin seed.
 *
 *   npm run seed:admin
 *
 * Prompts for email / password / name / company. Hashes the password with
 * bcrypt (matches AuthService.adminLogin), finds-or-creates the company by
 * name, then upserts the ADMIN user by email so re-running the script is safe.
 *
 * Skip prompts by setting env vars:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, COMPANY_NAME
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const prisma = new PrismaClient();

async function ask(
  rl: readline.Interface,
  question: string,
  defaultValue?: string,
): Promise<string> {
  const hint = defaultValue ? ` [${defaultValue}]` : '';
  const ans = (await rl.question(`${question}${hint}: `)).trim();
  return ans || defaultValue || '';
}

async function findOrCreateCompany(name: string) {
  const existing = await prisma.company.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.company.create({ data: { name } });
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const email =
      process.env.ADMIN_EMAIL ||
      (await ask(rl, 'Admin email', 'admin@example.com'));
    if (!/.+@.+\..+/.test(email)) {
      throw new Error(`Invalid email: ${email}`);
    }

    const password =
      process.env.ADMIN_PASSWORD || (await ask(rl, 'Admin password'));
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    const nameInput =
      process.env.ADMIN_NAME || (await ask(rl, 'Admin name (first [last])', 'Admin'));
    const nameParts = nameInput.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || 'Admin';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

    const companyName =
      process.env.COMPANY_NAME ||
      (await ask(rl, 'Company name', 'Default Company'));

    const company = await findOrCreateCompany(companyName);
    const hash = await bcrypt.hash(password, 10);

    const admin = await prisma.user.upsert({
      where: { email },
      update: {
        firstName,
        lastName,
        password: hash,
        role: 'ADMIN',
        isActive: true,
        companyId: company.id,
      },
      create: {
        email,
        firstName,
        lastName,
        password: hash,
        role: 'ADMIN',
        isActive: true,
        companyId: company.id,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, companyId: true },
    });

    console.log('\n✔ Admin ready');
    console.table([admin]);
    console.log(`Company: ${company.name} (${company.id})`);
    console.log('\nLogin with the email above and the password you just set.');
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n✘ Seed failed:', err.message);
  process.exit(1);
});
