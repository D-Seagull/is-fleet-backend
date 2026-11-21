import { Reflector } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import {
  normaliseDate,
  normaliseDraft,
  normaliseFinance,
  normaliseTime,
  type OrderDraft,
} from './order-draft.schema';
import { OrderImportController } from './order-import.controller';
import { languageName } from './order-parser';
import { toContentBlocks, UnsupportedOrderInput } from './order-input';

const stop = (over: Partial<OrderDraft['stops'][number]> = {}) => ({
  type: 'LOADING' as const,
  name: null,
  address: 'ACME GmbH, Hauptstr. 1, 10115 Berlin, DE',
  ref: null,
  windowDate: null,
  windowStart: null,
  windowEnd: null,
  page: null,
  needsReview: false,
  reviewNote: null,
  ...over,
});

const draft = (over: Partial<OrderDraft> = {}): OrderDraft => ({
  orderNumber: null,
  notes: null,
  stops: [stop()],
  finance: {
    freightRate: null,
    currency: null,
    loadedKm: null,
    emptyKm: null,
    tolls: null,
  },
  warnings: [],
  isTransportOrder: true,
  ...over,
});

describe('order draft normalisation', () => {
  it('pads times and accepts dot separators', () => {
    expect(normaliseTime('8:00')).toBe('08:00');
    expect(normaliseTime('08.30')).toBe('08:30');
    expect(normaliseTime('24:00')).toBeNull();
    expect(normaliseTime('ab 8 Uhr')).toBeNull();
  });

  it('keeps only real calendar dates', () => {
    expect(normaliseDate('2027-04-03')).toBe('2027-04-03');
    expect(normaliseDate('2027-02-30')).toBeNull();
    expect(normaliseDate('31.04.2027')).toBeNull();
    expect(normaliseDate('next Monday')).toBeNull();
  });

  it('reads the day-first dates printed on orders', () => {
    expect(normaliseDate('23.11.2026')).toBe('2026-11-23');
    expect(normaliseDate('3/4/2027')).toBe('2027-04-03');
    expect(normaliseDate('25-11-26')).toBe('2026-11-25');
  });

  it('flags a stop whose window had to be dropped instead of losing it silently', () => {
    const out = normaliseDraft(
      draft({
        stops: [stop({ windowDate: 'next Monday', windowStart: '8:00' })],
      }),
    );
    expect(out.stops[0]).toMatchObject({
      windowDate: null,
      windowStart: '08:00',
      needsReview: true,
    });
  });

  it('blanks become null, a name only stays on a waypoint', () => {
    const out = normaliseDraft(
      draft({
        orderNumber: '  ',
        stops: [
          stop({ name: 'should go', ref: ' ' }),
          stop({ type: 'WAYPOINT', name: ' Customs ' }),
        ],
        warnings: [' ', 'two order numbers'],
      }),
    );
    expect(out.orderNumber).toBeNull();
    expect(out.stops[0].name).toBeNull();
    expect(out.stops[0].ref).toBeNull();
    expect(out.stops[1].name).toBe('Customs');
    expect(out.warnings).toEqual(['two order numbers']);
  });

  it('drops nonsense page numbers', () => {
    const out = normaliseDraft(draft({ stops: [stop({ page: 0 })] }));
    expect(out.stops[0].page).toBeNull();
  });
});

describe('order finance normalisation', () => {
  it('keeps clean numbers and a 3-letter currency', () => {
    expect(
      normaliseFinance({
        freightRate: 1451.304,
        currency: ' eur ',
        loadedKm: 1264.4,
        emptyKm: 240,
        tolls: 368.42,
      }),
    ).toEqual({
      freightRate: 1451.3,
      currency: 'EUR',
      loadedKm: 1264,
      emptyKm: 240,
      tolls: 368.42,
    });
  });

  it('drops negatives, junk currency and a missing block', () => {
    expect(
      normaliseFinance({
        freightRate: -5,
        currency: 'Euro',
        loadedKm: null,
        emptyKm: Number.NaN,
        tolls: null,
      }),
    ).toEqual({
      freightRate: null,
      currency: null,
      loadedKm: null,
      emptyKm: null,
      tolls: null,
    });
    expect(normaliseFinance(undefined).freightRate).toBeNull();
  });
});

describe('order input', () => {
  it('sends a PDF as a document block', async () => {
    const { blocks, isPdf } = await toContentBlocks({
      kind: 'file',
      buffer: Buffer.from('%PDF-1.7 test'),
      fileName: 'order.pdf',
      mimeType: 'application/pdf',
    });
    expect(isPdf).toBe(true);
    expect(blocks[0]).toMatchObject({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf' },
    });
  });

  it('wraps pasted text and refuses an empty one', async () => {
    const { blocks } = await toContentBlocks({
      kind: 'text',
      text: 'Loading: Berlin',
    });
    expect(blocks[0]).toMatchObject({ type: 'text' });
    await expect(
      toContentBlocks({ kind: 'text', text: '   ' }),
    ).rejects.toBeInstanceOf(UnsupportedOrderInput);
  });

  it('refuses formats it cannot read', async () => {
    await expect(
      toContentBlocks({
        kind: 'file',
        buffer: Buffer.from('x'),
        fileName: 'order.doc',
        mimeType: 'application/msword',
      }),
    ).rejects.toBeInstanceOf(UnsupportedOrderInput);
  });

  it('maps UI locales to a language, Ukrainian by default', () => {
    expect(languageName('pl')).toBe('Polish');
    expect(languageName('de-DE')).toBe('German');
    expect(languageName(undefined)).toBe('Ukrainian');
  });
});

describe('order files stay away from drivers', () => {
  it('every order route is managers-only', () => {
    const roles = new Reflector().get<string[]>('roles', OrderImportController);
    expect(roles).toEqual(['ADMIN', 'TEAMLEAD', 'MANAGER']);
    expect(roles).not.toContain('DRIVER');
    // No route overrides the class-level roles with a wider list.
    const proto = OrderImportController.prototype as unknown as Record<
      string,
      () => unknown
    >;
    for (const name of [
      'status',
      'parse',
      'upload',
      'current',
      'remove',
      'finance',
      'saveFinance',
    ]) {
      const own = new Reflector().get<string[] | undefined>(
        'roles',
        proto[name],
      );
      expect(own).toBeUndefined();
    }
  });

  it('no query anywhere includes the orderFiles or finance relation', () => {
    // `orderFiles` / `finance: true | { … }` in an include or select would
    // hand the order to whoever loads that trip — drivers included.
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.ts$/.test(e.name) && !/\.spec\.ts$/.test(e.name)) {
          if (
            /\b(orderFiles|finance)\s*:\s*(true|\{)/.test(
              fs.readFileSync(p, 'utf8'),
            )
          )
            hits.push(p);
        }
      }
    };
    walk(path.join(__dirname, '..'));
    expect(hits).toEqual([]);
  });
});
