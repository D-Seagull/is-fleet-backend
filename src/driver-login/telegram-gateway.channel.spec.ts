import { Logger } from '@nestjs/common';
import { TelegramGatewayChannel } from './telegram-gateway.channel';
import { OtpDeliveryService } from './otp-delivery.service';

const driver = { id: 'd1', phone: '+380971234567', uiLocale: 'UK' };
const URL_ = 'https://gateway.example';
const make = (url: string | undefined, token: string | undefined) =>
  new TelegramGatewayChannel((k) =>
    k === 'TELEGRAM_GATEWAY_URL'
      ? url
      : k === 'TELEGRAM_GATEWAY_TOKEN'
        ? token
        : undefined,
  );

describe('TelegramGatewayChannel', () => {
  const fetchMock = jest.fn();
  const realFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  const reply = (body: unknown, status = 200) =>
    fetchMock.mockResolvedValue({ status, json: () => Promise.resolve(body) });

  it('sends OUR code to sendVerificationMessage with a bearer token', async () => {
    reply({ ok: true, result: { request_id: 'r1', request_cost: 0.01 } });
    await make(URL_ + '/', 'tok').deliver(driver, '123456', 5);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gateway.example/sendVerificationMessage');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({
      phone_number: '+380971234567',
      code: '123456',
      ttl: 300,
    });
  });

  it('keeps ttl inside the 30–3600 s the Gateway accepts', async () => {
    reply({ ok: true, result: { request_id: 'r1' } });
    const ch = make(URL_, 'tok');
    await ch.deliver(driver, '123456', 90);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).ttl).toBe(3600);
  });

  it('throws the Gateway error (caller logs it, client still gets ok)', async () => {
    reply({ ok: false, error: 'PHONE_NUMBER_INVALID' });
    await expect(
      make(URL_, 'tok').deliver(driver, '123456', 5),
    ).rejects.toThrow(/PHONE_NUMBER_INVALID/);
  });

  it('never logs the token or the code', async () => {
    const logged: string[] = [];
    const spy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((m: unknown) => void logged.push(String(m)));
    reply({ ok: true, result: { request_id: 'r1' } });
    await make(URL_, 'secret-tok').deliver(driver, '918273', 5);
    spy.mockRestore();
    for (const line of logged) {
      expect(line).not.toContain('secret-tok');
      expect(line).not.toContain('918273');
      expect(line).not.toContain('971234567');
    }
  });

  it('refuses to send without URL / token', async () => {
    await expect(
      make(undefined, 'tok').deliver(driver, '1', 5),
    ).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Telegram method switch', () => {
  const svc = (env: Record<string, string>) =>
    new OtpDeliveryService(
      { send: jest.fn() } as never,
      { get: (k: string) => env[k] } as never,
    );

  it('flag on but no Gateway URL/token → still hidden', () => {
    expect(
      svc({ LOGIN_TELEGRAM_ENABLED: 'true' }).enabledMethods(),
    ).not.toContain('telegram');
  });

  it('flag on + URL + token → offered', () => {
    const s = svc({
      LOGIN_TELEGRAM_ENABLED: 'true',
      TELEGRAM_GATEWAY_URL: URL_,
      TELEGRAM_GATEWAY_TOKEN: 'tok',
    });
    expect(s.enabledMethods()).toEqual(['sms', 'telegram', 'manager']);
    expect(s.direct('telegram')).not.toBeNull();
  });

  it('configured but flag off → hidden', () => {
    expect(
      svc({
        TELEGRAM_GATEWAY_URL: URL_,
        TELEGRAM_GATEWAY_TOKEN: 'tok',
      }).enabledMethods(),
    ).not.toContain('telegram');
  });
});
