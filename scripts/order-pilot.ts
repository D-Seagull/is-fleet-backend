/**
 * Order-import pilot: runs every order in a folder through the same parser
 * the API uses and writes one JSON per order plus a summary with tokens and
 * an estimated cost. Real orders hold client data — the folder is
 * git-ignored (order-samples/), never commit it.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/order-pilot.ts [folder] [locale]
 *
 * Needs ANTHROPIC_API_KEY in .env. ORDER_IMPORT_MODEL overrides the model.
 * ORDER_PILOT_PRICE_IN / ORDER_PILOT_PRICE_OUT ($ per million tokens) only
 * feed the cost estimate.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_ORDER_MODEL,
  parseOrder,
} from '../src/order-import/order-parser';
import type { OrderSource } from '../src/order-import/order-input';

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  eml: 'text/plain',
  csv: 'text/csv',
};

async function main() {
  const dir = path.resolve(process.argv[2] ?? 'order-samples');
  const locale = process.argv[3] ?? 'uk';
  const model = process.env.ORDER_IMPORT_MODEL || DEFAULT_ORDER_MODEL;
  const priceIn = Number(process.env.ORDER_PILOT_PRICE_IN ?? 4);
  const priceOut = Number(process.env.ORDER_PILOT_PRICE_OUT ?? 20);
  const outDir = path.join(dir, '_results');
  fs.mkdirSync(outDir, { recursive: true });

  const client = new Anthropic();
  const files = fs
    .readdirSync(dir)
    .filter((f) => MIME[path.extname(f).slice(1).toLowerCase()]);
  if (!files.length) {
    console.log(`No orders in ${dir}`);
    return;
  }

  const rows: string[] = [];
  let totalCost = 0;
  for (const f of files) {
    const ext = path.extname(f).slice(1).toLowerCase();
    const started = Date.now();
    try {
      const buffer = fs.readFileSync(path.join(dir, f));
      const source: OrderSource =
        ext === 'txt' || ext === 'eml'
          ? { kind: 'text', text: buffer.toString('utf8') }
          : { kind: 'file', buffer, fileName: f, mimeType: MIME[ext] };
      const r = await parseOrder(client, source, { locale, model });
      const ms = Date.now() - started;
      const cost =
        (r.usage.inputTokens * priceIn + r.usage.outputTokens * priceOut) /
        1e6;
      totalCost += cost;
      fs.writeFileSync(
        path.join(outDir, `${f}.json`),
        JSON.stringify({ ...r, ms, cost }, null, 2),
      );
      const review = r.draft.stops.filter((s) => s.needsReview).length;
      rows.push(
        [
          f,
          r.draft.stops.length,
          review,
          r.usage.inputTokens,
          r.usage.outputTokens,
          `$${cost.toFixed(4)}`,
          `${(ms / 1000).toFixed(1)}s`,
        ].join('\t'),
      );
      console.log(
        `OK  ${f}: ${r.draft.stops.length} stops, ${review} to review, $${cost.toFixed(4)}`,
      );
    } catch (err) {
      rows.push(`${f}\tERROR\t${(err as Error).message}`);
      console.log(`ERR ${f}: ${(err as Error).message}`);
    }
  }
  const summary =
    `model\t${model}\n` +
    `file\tstops\treview\tin\tout\tcost\ttime\n${rows.join('\n')}\n` +
    `total\t\t\t\t\t$${totalCost.toFixed(4)}\n`;
  fs.writeFileSync(path.join(outDir, '_summary.tsv'), summary);
  console.log(`\n${summary}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
