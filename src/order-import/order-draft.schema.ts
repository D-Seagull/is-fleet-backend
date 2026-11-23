import { z } from 'zod';

/**
 * What the model returns for one transport order: a DRAFT for the new-trip
 * form, never saved by itself. Field names match CreateTripDto / TripStopDto
 * so the client copies them straight into the form; the manager checks it
 * and creates the trip through the usual POST /trips.
 *
 * No length / pattern constraints here: structured outputs keep the shape,
 * `normaliseDraft` below enforces the formats CreateTripDto accepts.
 */
export const OrderStopSchema = z.object({
  type: z.enum(['LOADING', 'UNLOADING', 'WAYPOINT']),
  /** Label of a WAYPOINT (e.g. customs); null for loading / unloading. */
  name: z.string().nullable(),
  /** One line: company, street, postcode city, country — as written. */
  address: z.string().nullable(),
  /** Loading / unloading reference for THIS stop. */
  ref: z.string().nullable(),
  // The descriptions travel in the JSON schema the model fills: without them
  // it copied dates as printed ("23.11.2026") and they were dropped.
  windowDate: z
    .string()
    .nullable()
    .describe('Date of this stop, ISO format YYYY-MM-DD (e.g. 2026-11-23)'),
  windowStart: z
    .string()
    .nullable()
    .describe('Start of the time window, 24-hour HH:mm (e.g. 08:00)'),
  windowEnd: z
    .string()
    .nullable()
    .describe('End of the time window, 24-hour HH:mm, or null'),
  /** 1-based page of the PDF the stop was read from; null for other inputs. */
  page: z.number().int().nullable(),
  /** The manager must look at this stop (ambiguous date, unclear address…). */
  needsReview: z.boolean(),
  /** Why, in the manager's language; null when needsReview is false. */
  reviewNote: z.string().nullable(),
});

/** Money and distance, for managers only (TripFinance) — never the driver's notes. */
export const OrderFinanceSchema = z.object({
  freightRate: z
    .number()
    .nullable()
    .describe('Total freight paid to the carrier, e.g. 1451.30'),
  currency: z
    .string()
    .nullable()
    .describe('ISO 4217 code of freightRate, e.g. EUR'),
  loadedKm: z.number().nullable().describe('Loaded kilometres, e.g. 1264'),
  emptyKm: z.number().nullable().describe('Empty kilometres, e.g. 240'),
  tolls: z.number().nullable().describe('Tolls listed separately, e.g. 368.42'),
});

export const OrderDraftSchema = z.object({
  /** The carrier order / reference number (Auftragsnummer, Zlecenie nr…). */
  orderNumber: z.string().nullable(),
  /** Cargo + instructions for the driver. Never prices or payment terms. */
  notes: z.string().nullable(),
  /** Stops in route order. */
  stops: z.array(OrderStopSchema),
  finance: OrderFinanceSchema,
  /** Things that apply to the whole order (contradictions, missing pages…). */
  warnings: z.array(z.string()),
  /** False when the document is not a transport order at all. */
  isTransportOrder: z.boolean(),
});

export type OrderStop = z.infer<typeof OrderStopSchema>;
export type OrderFinance = z.infer<typeof OrderFinanceSchema>;
export type OrderDraft = z.infer<typeof OrderDraftSchema>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** European day-first, as printed on the orders: 23.11.2026, 23/11/2026, 23-11-26. */
const DMY = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/;
const TIME = /^(\d{1,2})[:.](\d{2})$/;

const clean = (s: string | null | undefined): string | null => {
  const v = (s ?? '').trim();
  return v ? v : null;
};

/** "8:00" / "08.00" → "08:00"; anything else → null. */
export function normaliseTime(s: string | null | undefined): string | null {
  const m = TIME.exec((s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/**
 * A real calendar date as "YYYY-MM-DD", else null. Also takes the
 * day-first form the orders print (and the model sometimes copies).
 */
export function normaliseDate(s: string | null | undefined): string | null {
  let v = (s ?? '').trim();
  const dmy = DMY.exec(v);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    v = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  if (!DATE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
    ? v
    : null;
}

/**
 * Make the model's draft safe for the form: formats CreateTripDto accepts,
 * blanks as null. A value that had to be dropped flags its stop for review
 * instead of disappearing silently.
 */
export function normaliseDraft(raw: OrderDraft): OrderDraft {
  const stops = raw.stops.map((s) => {
    const windowDate = normaliseDate(s.windowDate);
    const windowStart = normaliseTime(s.windowStart);
    const windowEnd = normaliseTime(s.windowEnd);
    const dropped =
      (clean(s.windowDate) && !windowDate) ||
      (clean(s.windowStart) && !windowStart) ||
      (clean(s.windowEnd) && !windowEnd);
    const reviewNote = clean(s.reviewNote);
    return {
      type: s.type,
      name: s.type === 'WAYPOINT' ? clean(s.name) : null,
      address: clean(s.address),
      ref: clean(s.ref),
      windowDate,
      windowStart,
      windowEnd,
      page: typeof s.page === 'number' && s.page > 0 ? s.page : null,
      needsReview: s.needsReview || Boolean(dropped),
      reviewNote,
    };
  });
  return {
    orderNumber: clean(raw.orderNumber),
    notes: clean(raw.notes),
    stops,
    finance: normaliseFinance(raw.finance),
    warnings: raw.warnings.map((w) => w.trim()).filter(Boolean),
    isTransportOrder: raw.isTransportOrder,
  };
}

const money = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0
    ? Math.round(v * 100) / 100
    : null;
const km = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;

/** Non-negative numbers (cents / whole km), a 3-letter currency, else null. */
export function normaliseFinance(
  raw: OrderFinance | null | undefined,
): OrderFinance {
  const currency = (raw?.currency ?? '').trim().toUpperCase();
  return {
    freightRate: money(raw?.freightRate),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
    loadedKm: km(raw?.loadedKm),
    emptyKm: km(raw?.emptyKm),
    tolls: money(raw?.tolls),
  };
}
