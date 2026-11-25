import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { OrderImportService } from './order-import.service';
import { OrderParseRefused, parseOrder } from './order-parser';
import { costUsd, modelPrice } from './ai-pricing';

jest.mock('./order-parser', () => ({
  ...jest.requireActual('./order-parser'),
  parseOrder: jest.fn(),
}));
const parseOrderMock = parseOrder as jest.MockedFunction<typeof parseOrder>;

/** A service with the server switch on/off and a company AI flag. */
function make(serverOn: boolean, companyAi: boolean | null) {
  const env: Record<string, string> = serverOn
    ? { ORDER_IMPORT_ENABLED: 'true', ANTHROPIC_API_KEY: 'test-key' }
    : {};
  const config = {
    get: (k: string) => env[k],
  } as unknown as ConfigService;
  const findUnique = jest.fn().mockResolvedValue(
    companyAi === null
      ? { company: null } // e.g. a user without a company
      : { company: { id: 'c1', aiEnabled: companyAi } },
  );
  const create = jest.fn().mockResolvedValue({});
  const prisma = {
    user: { findUnique, findFirst: jest.fn().mockResolvedValue(null) },
    aiUsage: { create },
  } as unknown as PrismaService;
  return {
    service: new OrderImportService(config, prisma),
    findUnique,
    create,
  };
}

const ctx = { userId: 'u1', companyId: 'c1' };
const text = { kind: 'text' as const, text: 'Loading: Berlin' };

describe('OrderImportService switches', () => {
  it('is on only when both the server and the company switch are on', async () => {
    expect(await make(true, true).service.enabledFor('u1')).toBe(true);
    expect(await make(true, false).service.enabledFor('u1')).toBe(false);
    expect(await make(false, true).service.enabledFor('u1')).toBe(false);
    expect(await make(true, null).service.enabledFor('u1')).toBe(false);
  });

  it('looks the company up by user id (ADMIN has no companyId on the request)', async () => {
    const { service, findUnique } = make(true, true);
    await service.enabledFor('admin-1');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'admin-1' } }),
    );
  });

  it('parse: 503 when the server switch is off', async () => {
    await expect(
      make(false, true).service.parse(text, ctx),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('parse: 403 when the company has AI off — before any model call', async () => {
    await expect(
      make(true, false).service.parse(text, ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

const draft = {
  orderNumber: null,
  notes: null,
  stops: [],
  finance: {
    freightRate: null,
    currency: null,
    loadedKm: null,
    emptyKm: null,
    tolls: null,
  },
  warnings: [],
  isTransportOrder: true,
};

describe('AI usage log', () => {
  beforeEach(() => parseOrderMock.mockReset());

  it('records an OK request with its tokens and cost', async () => {
    parseOrderMock.mockResolvedValue({
      draft,
      model: 'claude-opus-5-5',
      usage: { inputTokens: 4068, outputTokens: 1757 },
    });
    const { service, create } = make(true, true);
    await service.parse(text, ctx);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'c1',
        userId: 'u1',
        feature: 'ORDER_PARSE',
        model: 'claude-opus-5-5',
        inputTokens: 4068,
        outputTokens: 1757,
        costUsd: costUsd('claude-opus-5-5', 4068, 1757),
        status: 'OK',
      }),
    });
  });

  it('records a refusal with what it was billed', async () => {
    parseOrderMock.mockRejectedValue(
      new OrderParseRefused('claude-opus-5-5', {
        inputTokens: 100,
        outputTokens: 5,
      }),
    );
    const { service, create } = make(true, true);
    await expect(service.parse(text, ctx)).rejects.toBeDefined();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'REFUSED', inputTokens: 100 }),
    });
  });

  it('records a non-order as NOT_ORDER, once', async () => {
    parseOrderMock.mockResolvedValue({
      draft: { ...draft, isTransportOrder: false },
      model: 'claude-opus-5-5',
      usage: { inputTokens: 10, outputTokens: 1 },
    });
    const { service, create } = make(true, true);
    await expect(service.parse(text, ctx)).rejects.toBeDefined();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.status).toBe('NOT_ORDER');
  });

  it('does not fail the request when the log write fails', async () => {
    parseOrderMock.mockResolvedValue({
      draft,
      model: 'claude-opus-5-5',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const { service, create } = make(true, true);
    create.mockRejectedValue(new Error('db down'));
    await expect(service.parse(text, ctx)).resolves.toEqual(draft);
  });

  it('logs nothing when the company has AI off', async () => {
    const { service, create } = make(true, false);
    await expect(service.parse(text, ctx)).rejects.toBeDefined();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('AI pricing', () => {
  it('prices Opus 5.5 at $4 / $20 per million tokens', () => {
    expect(costUsd('claude-opus-5-5', 1_000_000, 0)).toBe(4);
    expect(costUsd('claude-opus-5-5', 0, 1_000_000)).toBe(20);
    expect(costUsd('claude-opus-5-5', 4068, 1757)).toBeCloseTo(0.051412, 6);
  });

  it('prices a suffixed id like its base and an unknown one at the default', () => {
    expect(modelPrice('claude-haiku-5-5-20270101').price).toEqual([0.1, 0.5]);
    expect(modelPrice('some-new-model')).toEqual({
      price: [4, 20],
      known: false,
    });
  });

  it('takes price overrides from AI_MODEL_PRICES', () => {
    process.env.AI_MODEL_PRICES = '{"claude-opus-5-5":[3,15]}';
    try {
      expect(costUsd('claude-opus-5-5', 1_000_000, 1_000_000)).toBe(18);
    } finally {
      delete process.env.AI_MODEL_PRICES;
    }
  });
});
