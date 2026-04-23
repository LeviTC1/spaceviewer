export const DAY_MS = 86_400_000;

export const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const toUtcDayMs = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

export const toUtcDateKey = (date: Date) => new Date(toUtcDayMs(date)).toISOString().slice(0, 10);

export const dateFromUtcDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
};
