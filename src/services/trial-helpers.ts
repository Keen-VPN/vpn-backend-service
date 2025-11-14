const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const addDaysUtc = (date: Date, days: number): Date => {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

export const isBeforeUtc = (a: Date, b: Date): boolean => {
  return a.getTime() < b.getTime();
};

export const differenceInCalendarDaysUtc = (future: Date, base: Date): number => {
  const utcFuture = Date.UTC(
    future.getUTCFullYear(),
    future.getUTCMonth(),
    future.getUTCDate()
  );
  const utcBase = Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate()
  );
  return Math.round((utcFuture - utcBase) / MS_PER_DAY);
};

export const computeTrialDaysRemaining = (
  trialEndsAt: Date | null,
  now: Date = new Date()
): number => {
  if (!trialEndsAt) {
    return 0;
  }

  const diff = differenceInCalendarDaysUtc(trialEndsAt, now);
  return diff > 0 ? diff : 0;
};

export const __testing = {
  MS_PER_DAY,
};

