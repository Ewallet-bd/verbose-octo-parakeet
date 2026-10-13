/**
 * Bangladesh Timezone Utilities (Asia/Dhaka, UTC+6)
 * Ensures all calculations, date filters, reports, and bot replies use BD Time.
 */

export const BD_TIMEZONE = 'Asia/Dhaka';

/**
 * Returns YYYY-MM-DD string in Bangladesh timezone for a given timestamp/Date.
 */
export function getBDDateString(dateInput: number | Date | string = Date.now()): string {
  const d = typeof dateInput === 'number' || typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BD_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Returns the Unix timestamp range [startTs, endTs] for a given date in Bangladesh Time.
 * If dateStr is provided (YYYY-MM-DD), calculates range for that BD day.
 * If not provided, calculates for current BD day.
 */
export function getBDDayRange(dateInput?: string | Date | number): { startTs: number; endTs: number; dateStr: string } {
  let dateStr: string;

  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    dateStr = dateInput;
  } else if (dateInput) {
    dateStr = getBDDateString(dateInput);
  } else {
    dateStr = getBDDateString();
  }

  const startTs = new Date(`${dateStr}T00:00:00+06:00`).getTime();
  const endTs = new Date(`${dateStr}T23:59:59.999+06:00`).getTime();

  return { startTs, endTs, dateStr };
}

/**
 * Formats timestamp to readable Date & Time in Bangladesh Timezone.
 * Example: "28 Aug 2026, 07:15:30 PM (BST)"
 */
export function formatBDDateTime(dateInput: number | Date | string, includeTzSuffix = false): string {
  const d = new Date(dateInput);
  const formatted = d.toLocaleString('en-GB', {
    timeZone: BD_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  return includeTzSuffix ? `${formatted} (BST)` : formatted;
}

/**
 * Formats timestamp to readable Date in Bangladesh Timezone.
 * Example: "28 Aug 2026" or "28/08/2026"
 */
export function formatBDDate(dateInput: number | Date | string): string {
  const d = new Date(dateInput);
  return d.toLocaleDateString('en-GB', {
    timeZone: BD_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Formats timestamp to readable Time in Bangladesh Timezone.
 * Example: "07:15:30 PM"
 */
export function formatBDTime(dateInput: number | Date | string): string {
  const d = new Date(dateInput);
  return d.toLocaleTimeString('en-US', {
    timeZone: BD_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}
