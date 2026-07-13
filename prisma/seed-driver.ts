/**
 * Interactive driver seed.
 *
 *   npm run seed:driver
 *
 * Creates (or refreshes) a DRIVER user attached to the first company in the
 * DB (or one you pick by name). Skips the OTP/SMS flow — the driver is
 * ready to log in straight away from the mobile app by entering their
 * phone number.
 *
 * Skip prompts by setting env vars:
 *   DRIVER_NAME, DRIVER_PHONE, DRIVER_LANGUAGE (EN/UK/PL/...), COMPANY_NAME
 */
import 'dotenv/config';
import { Language, PrismaClient } from '@prisma/client';
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

function normalizePhone(input: string): string | null {
  // Same shape AuthService expects: leading +, 8–20 digits.
  const stripped = input.replace(/[\s\-()]/g, '');
  if (!/^\+?\d{8,20}$/.test(stripped)) return null;
  return stripped.startsWith('+') ? stripped : `+${stripped}`;
}

async function pickCompany(name: string | null) {
  if (name) {
    const c = await prisma.company.findFirst({ where: { name } });
    if (!c) throw new Error(`Company not found: ${name}`);
    return c;
  }
  // Fall back to the first / only company. Useful for one-company test setups.
  const first = await prisma.company.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (!first) {
    throw new Error(
      'No company exists yet. Run `npm run seed:admin` first, or pass COMPANY_NAME.',
    );
  }
  return first;
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const nameInput =
      process.env.DRIVER_NAME ||
      (await ask(rl, 'Driver name (first [last])', 'Test Driver'));
    const nameParts = nameInput.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || 'Driver';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

    const phoneRaw =
      process.env.DRIVER_PHONE ||
      (await ask(rl, 'Driver phone (international)', '+380501234567'));
    const phone = normalizePhone(phoneRaw);
    if (!phone) {
      throw new Error(`Invalid phone: ${phoneRaw}`);
    }

    const languageInput =
      process.env.DRIVER_LANGUAGE ||
      (await ask(rl, 'Language (UK/EN/PL/LT/UZ/KZ/HI/RU)', 'EN'));
    const language = languageInput.toUpperCase() as Language;
    if (!['UK', 'EN', 'PL', 'LT', 'UZ', 'KZ', 'HI', 'RU'].includes(language)) {
      throw new Error(`Invalid language: ${languageInput}`);
    }

    const companyName =
      process.env.COMPANY_NAME ||
      (await ask(rl, 'Company name (blank = first existing)', ''));

    const company = await pickCompany(companyName || null);

    const driver = await prisma.user.upsert({
      where: { phone },
      update: {
        firstName,
        lastName,
        role: 'DRIVER',
        language,
        isActive: true,
        companyId: company.id,
      },
      create: {
        firstName,
        lastName,
        phone,
        role: 'DRIVER',
        language,
        companyId: company.id,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        language: true,
        companyId: true,
      },
    });

    console.log('\n✔ Driver ready');
    console.table([driver]);
    console.log(`Company: ${company.name} (${company.id})`);
    console.log(
      `\nLog in from the mobile app:\n` +
        `  1. Open is-driver, enter phone "${phone}"\n` +
        `  2. Backend sends OTP via SMS (Twilio). For local dev with no\n` +
        `     Twilio credentials, check the backend logs for the OTP code.`,
    );
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n✘ Seed failed:', err.message);
  process.exit(1);
});
