/**
 * src/core/domain/usage/types.ts
 *
 * Pure domain types for filament usage events.
 * No infrastructure imports — only business language.
 *
 * grams is always positive.
 *   consume  — reduces remaining by grams.
 *   adjustment — sets remaining to grams (absolute target value, not a delta).
 *
 * source describes what triggered the event:
 *   manual — direct user input (slider, text entry)
 *   scan   — NFC or QR code scan triggered an update
 *   sync   — a pull from a remote system wrote the value (audit trail entry)
 *   import — bulk import operation
 */

export type UsageEventType = "consume" | "adjustment";

export type UsageEventSource = "manual" | "scan" | "sync" | "import";

export interface UsageEvent {
  id: string;
  spoolLocalId: string;
  /** Always positive. For "consume": amount consumed. For "adjustment": new remaining weight. */
  grams: number;
  type: UsageEventType;
  /** Unix milliseconds when the usage occurred (not when it was recorded). */
  occurredAt: number;
  source: UsageEventSource;
  note?: string;
}
