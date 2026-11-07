import { dedupeSend } from './send-dedupe';

describe('dedupeSend', () => {
  it('runs once for the same sender + client id and returns the first result', async () => {
    const run = jest.fn().mockResolvedValue({ id: 'm1' });
    const [a, b] = await Promise.all([
      dedupeSend('u1', 'a1', run),
      dedupeSend('u1', 'a1', run),
    ]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ id: 'm1' });
    expect(b).toBe(a);
    // a later retry still gets the saved message
    await expect(dedupeSend('u1', 'a1', run)).resolves.toEqual({ id: 'm1' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not mix senders or client ids', async () => {
    const run = jest.fn().mockResolvedValue({ id: 'x' });
    await dedupeSend('u1', 'b1', run);
    await dedupeSend('u2', 'b1', run);
    await dedupeSend('u1', 'a2', run);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('runs every time without a client id', async () => {
    const run = jest.fn().mockResolvedValue({ id: 'x' });
    await dedupeSend('u1', undefined, run);
    await dedupeSend('u1', undefined, run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('lets a refused or failed send be retried', async () => {
    const refused = jest.fn().mockResolvedValue({ error: 'errors.nope' });
    await dedupeSend('u1', 'r1', refused);
    await dedupeSend('u1', 'r1', refused);
    expect(refused).toHaveBeenCalledTimes(2);

    const boom = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue({ id: 'ok' });
    await expect(dedupeSend('u1', 'f1', boom)).rejects.toThrow('db down');
    await expect(dedupeSend('u1', 'f1', boom)).resolves.toEqual({ id: 'ok' });
  });
});
