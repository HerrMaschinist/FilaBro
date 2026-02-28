/**
 * NFC Feature Module — src/features/nfc/NfcService.ts
 *
 * Graceful fallback strategy:
 *   1. Expo Go → shows "NFC requires Dev Client" message (module import skipped)
 *   2. No NFC hardware → shows "Device has no NFC"
 *   3. NFC disabled → prompts user to enable in system settings
 *   4. Full NFC → scanning works with NDEF text, URL, JSON payloads
 *
 * react-native-nfc-manager is imported lazily via require() so this module
 * does NOT crash when running in Expo Go (where native modules are unavailable).
 */

import { Platform } from "react-native";
import Constants from "expo-constants";

// ─── Expo Go detection ────────────────────────────────────────────────────────
// executionEnvironment === 'storeClient' means running inside Expo Go.
// appOwnership is the older API; check both for safety across SDK versions.
const IS_EXPO_GO =
  (Constants as any).executionEnvironment === "storeClient" ||
  (Constants as any).appOwnership === "expo";

// ─── Lazy native module load ───────────────────────────────────────────────────
// Wrapped in try/catch so the module load does not throw in Expo Go.
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
    // Runtime check: verify the native module is actually linked
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
  /** Extracted spool ID if any was found in the tag, otherwise null. */
  spoolId: string | null;
  /** Raw decoded text from the NDEF record. */
  raw: string;
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
  // Web browsers have no NFC hardware access at all
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

    // isEnabled() is only meaningful on Android; on iOS always assume enabled.
    try {
      const enabled: boolean = await _NfcManager.isEnabled();
      if (!enabled) {
        return {
          available: false,
          reason: "disabled",
          message:
            "NFC is disabled on this device. Enable it in System Settings → NFC.",
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
 * Cancel an active NFC scan. Safe to call even if no scan is active.
 */
export async function stopScan(): Promise<void> {
  if (!_NfcManager) return;
  try {
    await _NfcManager.cancelTechnologyRequest();
  } catch {
    // Ignore — no active scan to cancel
  }
}

/**
 * Parse raw text from an NFC tag into a structured payload.
 *
 * Supports these formats (in order):
 *   1. JSON:  { "spoolId": "123" }  or  { "id": "123" }
 *   2. URL:   http://host/spool/123  or  ?spoolId=123
 *   3. Plain: bare numeric or alphanumeric ID  "123"
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX_REGEX =
  /^(?:spool|filabro|spoolman|filament)[:\-#](.+)$/i;
const NUMERIC_ID_REGEX = /\b(\d{1,10})\b/;

export function parseTagPayload(raw: string): NfcTagPayload {
  const trimmed = raw.trim();

  // ── 1. JSON ───────────────────────────────────────────────────────────────
  try {
    const json = JSON.parse(trimmed);
    const id = json.spoolId ?? json.spool_id ?? json.id ?? null;
    if (id !== null) {
      return { spoolId: String(id), raw: trimmed };
    }
  } catch {
    // not JSON
  }

  // ── 2. Prefix variants: spool:42, filabro:42, spoolman:42, filament:42
  const prefixMatch = trimmed.match(PREFIX_REGEX);
  if (prefixMatch) {
    const val = prefixMatch[1].trim();
    if (/^\d+$/.test(val) || UUID_REGEX.test(val)) {
      return { spoolId: val, raw: trimmed };
    }
  }

  // ── 3. URL ────────────────────────────────────────────────────────────────
  try {
    const url = new URL(trimmed);

    const parts = url.pathname.split("/").filter(Boolean);
    const spoolIdx = parts.findIndex(
      (p) => p.toLowerCase() === "spool" || p.toLowerCase() === "spools"
    );
    if (spoolIdx >= 0 && parts[spoolIdx + 1]) {
      return { spoolId: parts[spoolIdx + 1], raw: trimmed };
    }

    const qId =
      url.searchParams.get("spoolId") ??
      url.searchParams.get("spool_id") ??
      url.searchParams.get("id");
    if (qId) {
      return { spoolId: qId, raw: trimmed };
    }
  } catch {
    // not a URL
  }

  // ── 4. Pure numeric ID ────────────────────────────────────────────────────
  if (/^\d+$/.test(trimmed)) {
    return { spoolId: trimmed, raw: trimmed };
  }

  // ── 5. Extract first numeric ID from free text ────────────────────────────
  const numMatch = trimmed.match(NUMERIC_ID_REGEX);
  if (numMatch) {
    return { spoolId: numMatch[1], raw: trimmed };
  }

  // Could not extract a spool ID
  return { spoolId: null, raw: trimmed };
}
