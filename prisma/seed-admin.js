"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const readline = __importStar(require("node:readline/promises"));
const node_process_1 = require("node:process");
const prisma = new client_1.PrismaClient();
async function ask(rl, question, defaultValue) {
    const hint = defaultValue ? ` [${defaultValue}]` : '';
    const ans = (await rl.question(`${question}${hint}: `)).trim();
    return ans || defaultValue || '';
}
async function findOrCreateCompany(name) {
    const existing = await prisma.company.findFirst({ where: { name } });
    if (existing)
        return existing;
    return prisma.company.create({ data: { name } });
}
async function main() {
    const rl = readline.createInterface({ input: node_process_1.stdin, output: node_process_1.stdout });
    try {
        const email = process.env.ADMIN_EMAIL ||
            (await ask(rl, 'Admin email', 'admin@example.com'));
        if (!/.+@.+\..+/.test(email)) {
            throw new Error(`Invalid email: ${email}`);
        }
        const password = process.env.ADMIN_PASSWORD || (await ask(rl, 'Admin password'));
        if (!password || password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }
        const name = process.env.ADMIN_NAME || (await ask(rl, 'Admin name', 'Admin'));
        const companyName = process.env.COMPANY_NAME ||
            (await ask(rl, 'Company name', 'Default Company'));
        const company = await findOrCreateCompany(companyName);
        const hash = await bcrypt.hash(password, 10);
        const admin = await prisma.user.upsert({
            where: { email },
            update: {
                name,
                password: hash,
                role: 'ADMIN',
                isActive: true,
                companyId: company.id,
            },
            create: {
                email,
                name,
                password: hash,
                role: 'ADMIN',
                isActive: true,
                companyId: company.id,
            },
            select: { id: true, email: true, name: true, role: true, companyId: true },
        });
        console.log('\n✔ Admin ready');
        console.table([admin]);
        console.log(`Company: ${company.name} (${company.id})`);
        console.log('\nLogin with the email above and the password you just set.');
    }
    finally {
        rl.close();
        await prisma.$disconnect();
    }
}
main().catch((err) => {
    console.error('\n✘ Seed failed:', err.message);
    process.exit(1);
});
//# sourceMappingURL=seed-admin.js.map