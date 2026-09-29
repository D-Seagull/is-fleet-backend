import { sortByProgress, withCurrentTripOnly } from './trip-order';

const trip = (id: string, status: string, at: number) => ({
  id,
  status,
  createdAt: new Date(at),
});

describe('trip order', () => {
  it('puts the trip furthest along first, even if a newer one was assigned', () => {
    const sorted = sortByProgress([
      trip('queued', 'ASSIGNED', 3000),
      trip('road', 'ON_WAY', 1000),
      trip('next', 'ACCEPTED', 2000),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['road', 'next', 'queued']);
  });

  it('keeps loads in the order given when the status is the same', () => {
    const sorted = sortByProgress([
      trip('second', 'ACCEPTED', 2000),
      trip('first', 'ACCEPTED', 1000),
    ]);
    expect(sorted[0].id).toBe('first');
  });

  it('withCurrentTripOnly leaves just the current trip on a truck', () => {
    const truck = {
      id: 'tr1',
      trips: [trip('queued', 'ASSIGNED', 3000), trip('road', 'LOADED', 1000)],
    };
    expect(withCurrentTripOnly(truck).trips.map((t) => t.id)).toEqual(['road']);
  });
});
