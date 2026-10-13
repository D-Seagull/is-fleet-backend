import { pushTitle } from './push-titles';

describe('pushTitle', () => {
  it('tells a trip chat, a direct message and a group apart', () => {
    expect(pushTitle.trip('DX90237', 'Dmytro Chaika', 'New message')).toBe(
      '🚚 DX90237 · Dmytro Chaika',
    );
    expect(pushTitle.direct('Dmytro Chaika', 'New message')).toBe(
      '💬 Dmytro Chaika',
    );
    expect(pushTitle.group('Night shift', 'Dmytro', 'New message')).toBe(
      '👥 Night shift · Dmytro',
    );
  });

  it('falls back when the name or plate is missing', () => {
    expect(pushTitle.trip(null, 'Dmytro', 'x')).toBe('🚚 Dmytro');
    expect(pushTitle.trip(null, '', 'New message')).toBe('🚚 New message');
    expect(pushTitle.direct('', 'New message')).toBe('💬 New message');
    expect(pushTitle.group(undefined, '', 'New message')).toBe(
      '👥 New message',
    );
  });
});
