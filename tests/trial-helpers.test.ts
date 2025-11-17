import {
  addDaysUtc,
  differenceInCalendarDaysUtc,
  computeTrialDaysRemaining,
} from '../src/services/trial-helpers.js';

describe('trial helper utilities', () => {
  it('adds days in UTC without DST drift', () => {
    const start = new Date('2025-03-09T05:00:00.000Z'); // DST boundary (US)
    const plus30 = addDaysUtc(start, 30);
    expect(plus30.toISOString()).toBe('2025-04-08T05:00:00.000Z');
  });

  it('computes calendar day differences correctly', () => {
    const start = new Date('2025-01-01T00:00:00.000Z');
    const end = new Date('2025-01-31T23:59:59.000Z');
    const diff = differenceInCalendarDaysUtc(end, start);
    expect(diff).toBe(30);
  });

  it('clamps negative remaining days to zero', () => {
    const now = new Date('2025-02-01T00:00:00.000Z');
    const ended = new Date('2025-01-31T00:00:00.000Z');
    const remaining = computeTrialDaysRemaining(ended, now);
    expect(remaining).toBe(0);
  });
});

