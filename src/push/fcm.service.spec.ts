import { FcmService } from './fcm.service';

const request = jest.fn();
jest.mock('google-auth-library', () => ({
  GoogleAuth: class {
    getClient() {
      return Promise.resolve({ request });
    }
  },
}));

describe('FcmService', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    request.mockReset();
  });

  const make = () => {
    process.env.FCM_SERVICE_ACCOUNT = JSON.stringify({
      project_id: 'is-fleet',
      client_email: 'x@is-fleet.iam.gserviceaccount.com',
      private_key: 'k',
    });
    return new FcmService();
  };

  it('is off without credentials and sends nothing', async () => {
    delete process.env.FCM_SERVICE_ACCOUNT;
    delete process.env.FCM_SERVICE_ACCOUNT_FILE;
    const fcm = new FcmService();
    expect(fcm.enabled).toBe(false);
    await expect(
      fcm.send('t', { title: 'a', body: 'b', channelId: 'chat' }),
    ).resolves.toEqual({ ok: false, code: 'NOT_CONFIGURED' });
    expect(request).not.toHaveBeenCalled();
  });

  it('sends a notification message the phone shows without waking the app', async () => {
    request.mockResolvedValue({ data: { name: 'm1' } });
    const fcm = make();

    await expect(
      fcm.send('tok', {
        title: 'Title',
        body: 'Body',
        data: { type: 'DM_MESSAGE', userId: 'u2' },
        channelId: 'chat',
        sound: 'push_message.mp3',
      }),
    ).resolves.toEqual({ ok: true });

    const { url, data } = request.mock.calls[0][0] as {
      url: string;
      data: { message: Record<string, any> };
    };
    expect(url).toBe(
      'https://fcm.googleapis.com/v1/projects/is-fleet/messages:send',
    );
    const m = data.message;
    expect(m.notification).toEqual({ title: 'Title', body: 'Body' });
    expect(m.android.priority).toBe('HIGH');
    expect(m.android.notification).toEqual(
      expect.objectContaining({ channel_id: 'chat', sound: 'push_message' }),
    );
    // expo-notifications reads the JS `content.data` from `data.body`.
    expect(JSON.parse(m.data.body)).toEqual({
      type: 'DM_MESSAGE',
      userId: 'u2',
    });
  });

  it('reports the FCM error code (UNREGISTERED → token is dead)', async () => {
    request.mockRejectedValue({
      response: {
        data: {
          error: {
            status: 'NOT_FOUND',
            details: [{ errorCode: 'UNREGISTERED' }],
          },
        },
      },
    });
    await expect(
      make().send('tok', { title: 'a', body: 'b', channelId: 'chat' }),
    ).resolves.toEqual({ ok: false, code: 'UNREGISTERED' });
  });
});
