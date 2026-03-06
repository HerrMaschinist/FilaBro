/**
 * NFC Feature Module — src/features/nfc/NfcService.ts
 *
 * Graceful fallback strategy:
 *   1. Expo Go → shows "NFC requires Dev Client" message (module import skipped)
 *   2. No NFC hardware → shows "Device has no NFC"
 *   3. NFC disabled → prompts user to enable in system settings
 *   4. Full NFC → scanning and writing works via NDEF
 *
 * Tag format (FilaBro-centric, version-stamped, backend-neutral):
 *   filabro:v1:<spoolLocalId>
 *
 *   Examples:
 *     filabro:v1:a1b2c3d4-1234-5678-abcd-ef0123456789
 *     filabro:v1:demo-1
 *
 * react-native-nfc-manager is imported lazily via require() so this module
 * does NOT crash when running in Expo Go (where native modules are unavailable).
 */

import { Platform } from "react-native";
import Constants from "expo-constants";

// ─── Expo Go detection ────────────────────────────────────────────────────────
const IS_EXPO_GO =
  (Constants as any).executionEnvironment === "storeClient" ||
  (Constants as any).appOwnership === "expo";

// ─── Lazy native module load ───────────────────────────────────────────────────
let _NfcManager: any = null;
let _NfcTech: any = null;
let _Ndef: any = null;
let _nativeAvailable = false;

if (Platform.OS !== "web" && !IS_EXPO_GO) {
  try {
    const mod = require("react-native-nfc-manager");
    _NfcManager = mod.default;
    _NfcTech = mod.NfcTech;
    _Ndef = mod.Ndef;
    if (_NfcManager && typeof _NfcManager.isSupported === "function") {
      _nativeAvailable = true;
    }
  } catch {
    _nativeAvailable = false;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type NfcUnavailableReason =
  | "expo_go"
  | "no_hardware"
  | "disabled"
  | "native_error";

export type NfcAvailability =
  | { available: true }
  | { available: false; reason: NfcUnavailableReason; message: string };

export interface NfcTagPayload {
  /**
   * The spool identifier found in the tag.
   * When isLocalId=true this is a spoolLocalId (UUID or app-generated ID).
   * When isLocalId=false this is a numeric Spoolman remoteId string.
   */
  spoolId: string | null;
  /**
   * True when spoolId is a FilaBro localId (filabro:v1: format).
   * False when spoolId is a numeric remote/Spoolman ID.
   */
  isLocalId: boolean;
  /** Raw decoded text from the NDEF record. */
  raw: string;
}

// ─── Tag format helpers ────────────────────────────────────────────────────────

const FILABRO_TAG_PREFIX = "filabro:v1:";

/**
 * Build the canonical FilaBro NDEF payload for a given spoolLocalId.
 * Format: filabro:v1:<spoolLocalId>
 */
export function formatTagPayload(spoolLocalId: string): string {
  return `${FILABRO_TAG_PREFIX}${spoolLocalId}`;
}

/**
 * Extract the spoolLocalId from a FilaBro-formatted tag payload.
 * Returns null if the payload is not in FilaBro format.
 */
export function extractLocalIdFromPayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith(FILABRO_TAG_PREFIX)) {
    return trimmed.slice(FILABRO_TAG_PREFIX.length).trim() || null;
  }
  return null;
}

// ─── One-time init guard ───────────────────────────────────────────────────────
let _started = false;
async function ensureStarted(): Promise<void> {
  if (_started || !_NfcManager) return;
  await _NfcManager.start();
  _started = true;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether NFC is available and ready on this device/build.
 * Always safe to call — never throws.
 */
export async function checkNfcAvailability(): Promise<NfcAvailability> {
  if (Platform.OS === "web") {
    return {
      available: false,
      reason: "no_hardware",
      message: "NFC is not supported in web browsers. Use the Android app to scan NFC tags.",
    };
  }

  if (IS_EXPO_GO) {
    return {
      available: false,
      reason: "expo_go",
      message:
        "NFC requires an Expo Dev Client or EAS Build. " +
        "Run `npx expo run:android` or build via EAS to use NFC.",
    };
  }

  if (!_nativeAvailable || !_NfcManager) {
    return {
      available: false,
      reason: "no_hardware",
      message: "NFC native module could not be loaded on this device.",
    };
  }

  try {
    const supported: boolean = await _NfcManager.isSupported();
    if (!supported) {
      return {
        available: false,
        reason: "no_hardware",
        message: "This device does not have NFC hardware.",
      };
    }

    await ensureStarted();

    try {
      const enabled: boolean = await _NfcManager.isEnabled();
      if (!enabled) {
        return {
          available: false,
          reason: "disabled",
          message: "NFC is disabled on this device. Enable it in System Settings → NFC.",
        };
      }
    } catch {
      // iOS doesn't expose isEnabled() — continue as available
    }

    return { available: true };
  } catch (err: unknown) {
    return {
      available: false,
      reason: "native_error",
      message: err instanceof Error ? err.message : "NFC check failed",
    };
  }
}

/**
 * Scan a single NDEF NFC tag. Resolves with the parsed payload or rejects on error.
 * Call stopScan() to cancel an active scan.
 */
export async function scanTagOnce(): Promise<NfcTagPayload> {
  if (!_NfcManager || !_NfcTech || !_Ndef) {
    throw new Error("NFC is not available on this device or build.");
  }

  await ensureStarted();

  try {
    await _NfcManager.requestTechnology(_NfcTech.Ndef);
    const tag = await _NfcManager.getTag();

    const record = tag?.ndefMessage?.[0];
    if (!record) {
      throw new Error("Tag has no NDEF message. Ensure the tag is formatted.");
    }

    const raw: string = _Ndef.text.decodePayload(
      new Uint8Array(record.payload)
    );

    return parseTagPayload(raw);
  } finally {
    await _NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

/**
 * Write a FilaBro NFC tag payload for the given spoolLocalId.
 *
 * Write flow:
 *   1. Try NfcTech.Ndef (works on already-formatted tags and most blank tags)
 *   2. On Android, if Ndef fails, fall back to NfcTech.NdefFormatable for
 *      completely blank tags that need initial formatting before writing.
 *   3. After writing, read back the tag to verify correctness.
 *
 * Returns the written payload string ("filabro:v1:<spoolLocalId>") on success.
 * Throws a descriptive Error on failure.
 *
 * Platform notes:
 *   - iOS: only NfcTech.Ndef is available. Blank tags must already be formatted.
 *     Most modern NFC tags (NTAG213/215/216) are pre-formatted and work fine.
 *   - Android: NfcTech.NdefFormatable is also available as a fallback.
 *   - Web: not supported, throws immediately.
 *   - Expo Go: not supported, throws immediately.
 */
export async function writeTag(spoolLocalId: string): Promise<string> {
  if (!_NfcManager || !_NfcTech || !_Ndef) {
    throw new Error("NFC is not available on this device or build.");
  }

  await ensureStarted();

  const payload = formatTagPayload(spoolLocalId);
  let bytes: number[];
  try {
    bytes = _Ndef.encodeMessage([_Ndef.textRecord(payload)]);
  } catch {
    throw new Error("Failed to encode NDEF message.");
  }

  // ── Attempt 1: NfcTech.Ndef (works on pre-formatted tags and most blanks) ──
  let ndefFailed = false;
  try {
    await _NfcManager.requestTechnology(_NfcTech.Ndef);
    try {
      await _NfcManager.ndefHandler.writeNdefMessage(bytes);

      // Verify by reading back
      const tag = await _NfcManager.getTag();
      const record = tag?.ndefMessage?.[0];
      if (record) {
        const verified: string = _Ndef.text.decodePayload(
          new Uint8Array(record.payload)
        );
        if (verified !== payload) {
          throw new Error(
            `Tag verification failed: expected "${payload}", got "${verified}".`
          );
        }
      }

      return payload;
    } finally {
      await _NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  } catch (err: unknown) {
    ndefFailed = true;
    const msg = err instanceof Error ? err.message : String(err);
    // If it's a verification failure, don't try the formatable path
    if (msg.includes("verification failed")) throw err;
  }

  // ── Attempt 2: NfcTech.NdefFormatable (Android only — blank unformatted tags) ──
  if (ndefFailed && Platform.OS === "android" && _NfcTech.NdefFormatable) {
    try {
      await _NfcManager.requestTechnology(_NfcTech.NdefFormatable);
      try {
        await _NfcManager.ndefHandler.writeNdefMessage(bytes);
        return payload;
      } finally {
        await _NfcManager.cancelTechnologyRequest().catch(() => {});
      }
    } catch (formatErr: unknown) {
      const msg =
        formatErr instanceof Error ? formatErr.message : String(formatErr);
      throw new Error(
        `Could not write to NFC tag. ` +
          `Ensure the tag is writable and held steady during write. (${msg})`
      );
    }
  }

  throw new Error(
    "Could not write to NFC tag. " +
      "Ensure the tag supports NDEF and is not read-only."
  );
}

/**
 * Cancel an active NFC scan or write session. Safe to call even if none is active.
 */
export async function stopScan(): Promise<void> {
  if (!_NfcManager) return;
  try {
    await _NfcManager.cancelTechnologyRequest();
  } catch {
    // Ignore — no active session to cancel
  }
}

// ─── Payload parser ───────────────────────────────────────────────────────────

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_ID_REGEX = /\b(\d{1,10})\b/;

/**
 * Parse raw text from an NFC tag into a structured payload.
 *
 * Priority order:
 *   1. FilaBro native format: filabro:v1:<localId>   → isLocalId=true
 *   2. JSON: { "spoolId": "..." } or { "id": "..." }
 *   3. Prefix: spool:42, filabro:42, spoolman:42
 *   4. URL:  http://host/spool/42  or  ?spoolId=42
 *   5. Pure numeric ID: "42"
 *   6. First numeric ID in free text
 */
export function parseTagPayload(raw: string): NfcTagPayload {
  const trimmed = raw.trim();

  // ── 1. FilaBro native format ───────────────────────────────────────────────
  const localId = extractLocalIdFromPayload(trimmed);
  if (localId !== null) {
    return { spoolId: localId, isLocalId: true, raw: trimmed };
  }

  // ── 2. JSON ───────────────────────────────────────────────────────────────
  try {
    const json = JSON.parse(trimmed);
    const id = json.spoolLocalId ?? json.spoolId ?? json.spool_id ?? json.id ?? null;
    if (id !== null) {
      const idStr = String(id);
      return {
        spoolId: idStr,
        isLocalId: UUID_REGEX.test(idStr) || !!json.spoolLocalId,
        raw: trimmed,
      };
    }
  } catch {
    // not JSON
  }

  // ── 3. Prefix variants: spool:42, filabro:42, spoolman:42 ─────────────────
  const prefixMatch = trimmed.match(
    /^(?:spool|filabro|spoolman|filament)[:\-#](.+)$/i
  );
  if (prefixMatch) {
    const val = prefixMatch[1].trim();
    if (/^\d+$/.test(val)) {
      return { spoolId: val, isLocalId: false, raw: trimmed };
    }
    if (UUID_REGEX.test(val)) {
      return { spoolId: val, isLocalId: true, raw: trimmed };
    }
  }

  // ── 4. URL ────────────────────────────────────────────────────────────────
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const spoolIdx = parts.findIndex(
      (p) => p.toLowerCase() === "spool" || p.toLowerCase() === "spools"
    );
    if (spoolIdx >= 0 && parts[spoolIdx + 1]) {
      const val = parts[spoolIdx + 1];
      return {
        spoolId: val,
        isLocalId: UUID_REGEX.test(val),
        raw: trimmed,
      };
    }

    const qId =
      url.searchParams.get("spoolId") ??
      url.searchParams.get("spool_id") ??
      url.searchParams.get("id");
    if (qId) {
      return { spoolId: qId, isLocalId: UUID_REGEX.test(qId), raw: trimmed };
    }
  } catch {
    // not a URL
  }

  // ── 5. Pure numeric ID ────────────────────────────────────────────────────
  if (/^\d+$/.test(trimmed)) {
    return { spoolId: trimmed, isLocalId: false, raw: trimmed };
  }

  // ── 6. Extract first numeric ID from free text ────────────────────────────
  const numMatch = trimmed.match(NUMERIC_ID_REGEX);
  if (numMatch) {
    return { spoolId: numMatch[1], isLocalId: false, raw: trimmed };
  }

  return { spoolId: null, isLocalId: false, raw: trimmed };
}
