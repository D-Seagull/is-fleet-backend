import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_ORDER_MODEL,
  OrderParseEmpty,
  OrderParseRefused,
  parseOrder,
} from './order-parser';
import { UnsupportedOrderInput, type OrderSource } from './order-input';
import type { OrderDraft } from './order-draft.schema';

/**
 * "Fill from order": a transport order (file or pasted text) → a draft for
 * the new-trip form. Nothing is stored here — the file is uploaded again,
 * with the trip, once the manager confirms (OrderFilesService).
 *
 * Off unless ORDER_IMPORT_ENABLED=true and ANTHROPIC_API_KEY is set, so an
 * environment without a key answers a clear 503 instead of a crash.
 */
@Injectable()
export class OrderImportService {
  private readonly logger = new Logger(OrderImportService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    const enabled = config.get<string>('ORDER_IMPORT_ENABLED') === 'true';
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.client = enabled && apiKey ? new Anthropic({ apiKey }) : null;
    this.model =
      config.get<string>('ORDER_IMPORT_MODEL') || DEFAULT_ORDER_MODEL;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async parse(
    source: OrderSource,
    ctx: {
      userId: string;
      companyId: string | null;
      locale?: string;
      /** The driver picked in the form: notes are written in their language. */
      driverId?: string;
    },
  ): Promise<OrderDraft> {
    if (!this.client) {
      throw new ServiceUnavailableException('errors.orderImportDisabled');
    }
    const started = Date.now();
    try {
      const driverLocale = await this.driverLocale(ctx.driverId, ctx.companyId);
      const { draft, model, usage } = await parseOrder(this.client, source, {
        locale: ctx.locale,
        driverLocale,
        model: this.model,
      });
      // Tokens and timing only: the order's content never goes to the logs.
      this.logger.log({
        msg: 'order parsed',
        userId: ctx.userId,
        companyId: ctx.companyId,
        model,
        // Which language the notes were written in (null → English): the
        // first thing to check when a driver gets notes in the wrong one.
        driverLanguage: driverLocale,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        stops: draft.stops.length,
        ms: Date.now() - started,
      });
      if (!draft.isTransportOrder) {
        throw new UnprocessableEntityException('errors.orderNotRecognised');
      }
      return draft;
    } catch (err) {
      throw this.toHttpError(err);
    }
  }

  /**
   * The language the driver picked in the app — `User.language` (is-driver
   * settings write that one; a driver's uiLocale stays at its default).
   * Only a driver of the requester's company counts — an ADMIN
   * has no company (AdminInterceptor) and may pick any. Unknown → null,
   * and the notes come out in English.
   */
  private async driverLocale(
    driverId: string | undefined,
    companyId: string | null,
  ): Promise<string | null> {
    if (!driverId) return null;
    const driver = await this.prisma.user.findFirst({
      where: {
        id: driverId,
        role: 'DRIVER',
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      select: { language: true },
    });
    return driver?.language ?? null;
  }

  private toHttpError(err: unknown): unknown {
    if (err instanceof UnprocessableEntityException) return err;
    if (err instanceof UnsupportedOrderInput) {
      return err.message === 'empty' || err.message === 'too long'
        ? new BadRequestException('errors.orderEmpty')
        : new UnsupportedMediaTypeException('errors.fileTypeNotSupported');
    }
    if (err instanceof OrderParseRefused || err instanceof OrderParseEmpty) {
      return new UnprocessableEntityException('errors.orderParseFailed');
    }
    // Most specific first: a bad request is our bug, the rest is the
    // provider being busy or unreachable — the manager can retry later.
    if (err instanceof Anthropic.BadRequestError) {
      this.logger.error(`order parse rejected: ${err.message}`);
      return new UnprocessableEntityException('errors.orderParseFailed');
    }
    if (
      err instanceof Anthropic.RateLimitError ||
      err instanceof Anthropic.InternalServerError ||
      err instanceof Anthropic.APIConnectionError
    ) {
      this.logger.warn(`order parse unavailable: ${(err as Error).message}`);
      return new ServiceUnavailableException('errors.orderParseUnavailable');
    }
    if (err instanceof Anthropic.APIError) {
      this.logger.error(`order parse failed: ${err.status} ${err.message}`);
      return new ServiceUnavailableException('errors.orderParseUnavailable');
    }
    return err;
  }
}
