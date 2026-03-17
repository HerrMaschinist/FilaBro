import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import type { Spool } from "@/lib/spoolViewTypes";
import {
  checkNfcAvailability,
  scanTagOnce,
  stopScan,
  type NfcAvailability,
} from "@/src/features/nfc";

type ScanMode = "qr" | "nfc";
type NfcScanState = "idle" | "checking" | "scanning" | "success" | "error";

/**
 * Source of a scan event. Used by handleScanResult() to vary UX subtly.
 * nfc_local  = FilaBro native tag (filabro:v1:<localId>)
 * nfc_legacy = old numeric remote-ID tag
 * nfc_remote = plain-text NFC payload treated as barcode lookup
 * barcode    = QR code or 1-D barcode from camera
 */
export type ScanSource = "barcode" | "qr" | "nfc_local" | "nfc_legacy" | "nfc_remote";

export type ScanResolution =
  | { type: "none";         code: string; source: ScanSource }
  | { type: "single";       code: string; source: ScanSource; spool: Spool }
  | { type: "multiple";     code: string; source: ScanSource; spools: Spool[] }
  | { type: "direct_open";  code: string; source: ScanSource; spool: Spool };

export type ScanHistoryEntry = {
  id: string;
  timestamp: number;
  code: string;
  source: ScanSource;
  resolutionType: ScanResolution["type"];
  matchCount: number;
};

function extractSpoolId(data: string): number | null {
  const raw = String(data ?? "").trim();
  if (!raw) return null;

  const urlMatch = raw.match(/\/spool[s]?\/(\d+)/i);
  if (urlMatch) return parseInt(urlMatch[1], 10);

  const qMatch = raw.match(/[?&](?:spool_?id|id)=(\d+)/i);
  if (qMatch) return parseInt(qMatch[1], 10);

  return null;
}

/**
 * Normalise a raw barcode/QR scan string.
 * Trims whitespace and strips known scanner-prefix junk.
 * Does NOT touch NFC payloads that contain filabro: prefixes.
 */
function normalizeBarcode(raw: string): string {
  return raw.trim().replace(/^(?:barcode:|scan:|code:)/i, "").trim();
}

export default function ScannerScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const {
    spools,
    createSpool,
    serverUrl,
    refreshSpools,
    persistenceEnabled,
    findSpoolsByQrCode,
  } = useApp();


  const [mode, setMode] = useState<ScanMode>("qr");
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const [nfcAvailability, setNfcAvailability] = useState<NfcAvailability | null>(null);
  const [nfcState, setNfcState] = useState<NfcScanState>("idle");
  const [nfcMessage, setNfcMessage] = useState("");
  const [nfcRaw, setNfcRaw] = useState<string | null>(null);
  const isScanningRef = useRef(false);

  // NFC sub-mode: read / write
  const [nfcSubMode, setNfcSubMode] = useState<"read" | "write">("read");
  const nfcSubPillAnim = useSharedValue(0);
  const nfcReadScale = useSharedValue(1);
  const nfcWriteScale = useSharedValue(1);
  const [nfcSubWidth, setNfcSubWidth] = useState(220);
  // NFC write: selected spool localId
  const [writeLocalId, setWriteLocalId] = useState<string | null>(null);

  // Scan-lock: prevents double-trigger from camera or NFC events.
  const scanLockRef = useRef(false);

  // ScanResolution state — drives the unified match sheet
  const [scanResolution, setScanResolution] = useState<ScanResolution | null>(null);

  // Scan History
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);

  // Legacy state kept for old notFoundSheet (numeric-ID path)
  const [pendingSpoolId, setPendingSpoolId] = useState<number | null>(null);
  const [notFoundSheet, setNotFoundSheet] = useState(false);
  const [notFoundLoading, setNotFoundLoading] = useState<"create" | "fetch" | null>(null);

  // Toast state
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastOpacity = useSharedValue(0);
  const toastY = useSharedValue(10);

  // Segmented control animation
  const pillAnim = useSharedValue(0);
  const [switcherWidth, setSwitcherWidth] = useState(240);
  const qrScale = useSharedValue(1);
  const nfcScale = useSharedValue(1);

  // Content fade on mode switch
  const contentOpacity = useSharedValue(1);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90;

  // ─── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    toastY.value = 10;
    toastOpacity.value = withTiming(1, { duration: 180 });
    toastY.value = withSpring(0, { damping: 14, stiffness: 280 });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      toastOpacity.value = withTiming(0, { duration: 220 });
      toastY.value = withSpring(10, { damping: 14, stiffness: 280 });
      setTimeout(() => setToastMsg(null), 230);
    }, 2400);
  }, [toastOpacity, toastY]);

  const toastStyle = useAnimatedStyle(() => ({
    opacity: toastOpacity.value,
    transform: [{ translateY: toastY.value }],
  }));

  // ─── Mode change effect ────────────────────────────────────────────────────
  useEffect(() => {
    pillAnim.value = withSpring(mode === "qr" ? 0 : 1, {
      damping: 18,
      stiffness: 280,
      mass: 0.8,
    });
    contentOpacity.value = withSequence(
      withTiming(0.60, { duration: 85 }),
      withTiming(1, { duration: 195 })
    );
    if (mode === "nfc" && !nfcAvailability) {
      setNfcState("checking");
      checkNfcAvailability().then((result) => {
        setNfcAvailability(result);
        setNfcState("idle");
      });
    }
    if (mode !== "nfc" && isScanningRef.current) {
      isScanningRef.current = false;
      stopScan();
      setNfcState("idle");
    }
    if (mode !== "nfc") {
      setNfcSubMode("read");
      nfcSubPillAnim.value = 0;
      setWriteLocalId(null);
    }
  }, [mode]);

  useEffect(() => {
    nfcSubPillAnim.value = withSpring(nfcSubMode === "read" ? 0 : 1, {
      damping: 18,
      stiffness: 280,
      mass: 0.8,
    });
    if (nfcSubMode === "read") setWriteLocalId(null);
  }, [nfcSubMode]);

  // Pill geometry
  const pillWidth = Math.max(0, (switcherWidth - 8) / 2);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillAnim.value * pillWidth }],
  }));

  const qrScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: qrScale.value }],
  }));

  const nfcScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: nfcScale.value }],
  }));

  const contentFadeStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  // NFC sub-mode pill geometry
  const nfcSubPillWidth = Math.max(0, (nfcSubWidth - 8) / 2);
  const nfcSubPillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: nfcSubPillAnim.value * nfcSubPillWidth }],
  }));
  const nfcReadScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: nfcReadScale.value }],
  }));
  const nfcWriteScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: nfcWriteScale.value }],
  }));

  // Active spools for write picker (non-archived + has a valid localId)
  const activeSpools = spools.filter((s) => !s.archived && !!s._localId);

  // Context-aware segmented control colors
  const onCamera = mode === "qr" && !!permission?.granted;
  const segBg = onCamera
    ? "rgba(0,0,0,0.42)"
    : isDark
    ? "rgba(255,255,255,0.08)"
    : "rgba(0,0,0,0.06)";
  const segBorderColor = onCamera || isDark
    ? "rgba(255,255,255,0.10)"
    : "rgba(0,0,0,0.09)";
  const activeTextColor = "#FFFFFF";
  const inactiveTextColor = onCamera || isDark
    ? "rgba(255,255,255,0.46)"
    : "rgba(0,0,0,0.38)";

  // ─── "Spool not found" handlers (legacy numeric-ID path) ──────────────────
  const openNotFoundSheet = useCallback((spoolId: number) => {
    setPendingSpoolId(spoolId);
    setNotFoundSheet(true);
  }, []);

  const dismissNotFoundSheet = useCallback(() => {
    if (notFoundLoading) return;
    setNotFoundSheet(false);
    setScanned(false);
    setNfcState("idle");
    setNfcMessage("");
  }, [notFoundLoading]);

  // ─── Match sheet (ScanResolution) handlers ─────────────────────────────────────
  const dismissMatchSheet = useCallback(() => {
    setScanResolution(null);
    scanLockRef.current = false;
    setScanned(false);
    setNfcState("idle");
    setNfcMessage("");
  }, []);

  // ─── Central offline-first scan dispatcher ─────────────────────────────────
  /**
   * handleScanResult — the single decision point for all scan events.
   *
   * Falls:
   *   0 Treffer  → navigate to /add-spool with code pre-filled (Fall none)
   *   1 Treffer  → show SpoolMatchSheet with single-spool card  (Fall single)
   *   N Treffer  → show SpoolMatchSheet with selectable list    (Fall multiple)
   *   direct     → skip sheet, open spool directly              (Fall direct_open)
   *
   * The scan-lock (scanLockRef) must be acquired BEFORE calling this function.
   */
  const handleScanResult = useCallback(async (code: string, source: ScanSource) => {
    const normalized = normalizeBarcode(code);
    if (!normalized) {
      scanLockRef.current = false;
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Multi-match DB lookup (indexed, O(log n))
    const matches = await findSpoolsByQrCode(normalized);

    let resolution: ScanResolution;
    if (matches.length === 0) {
      resolution = { type: "none", code: normalized, source };
    } else if (matches.length === 1) {
      resolution = { type: "single", code: normalized, source, spool: matches[0] };
    } else {
      resolution = { type: "multiple", code: normalized, source, spools: matches };
    }

    setScanHistory(prev => [{
      id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 7),
      timestamp: Date.now(),
      code: normalized,
      source,
      resolutionType: resolution.type,
      matchCount: matches.length
    }, ...prev].slice(0, 20));

    if (resolution.type === "none") {
      // Fall 0 Treffer — direkt zu /add-spool
      scanLockRef.current = false;
      router.push({ pathname: "/add-spool", params: { qrCode: normalized, scanSource: source } });
      return;
    }

    // Fall 1 oder N Treffer — Match Sheet anzeigen
    setScanResolution(resolution);
  }, [findSpoolsByQrCode]);

  const handleCreateLocal = useCallback(async () => {
    if (pendingSpoolId === null) return;
    setNotFoundLoading("create");
    const ok = await createSpool({
      filamentLocalId: "",
      displayName: `Spool #${pendingSpoolId}`,
    });
    setNotFoundLoading(null);
    setNotFoundSheet(false);
    setScanned(false);
    setNfcState("idle");
    setNfcMessage("");
    if (ok) {
      showToast(t("scanner.spool_created"));
    }
  }, [pendingSpoolId, createSpool, showToast, t]);

  const handleFetchServer = useCallback(async () => {
    if (pendingSpoolId === null) return;
    if (!serverUrl) {
      setNotFoundSheet(false);
      showToast(t("scanner.spool_no_server"));
      return;
    }
    setNotFoundLoading("fetch");
    try {
      await refreshSpools();
      setNotFoundLoading(null);
      setNotFoundSheet(false);
      // After sync the spool (if it exists on server) is now in local spools
      router.push({ pathname: "/spool/[id]", params: { id: String(pendingSpoolId) } });
    } catch {
      setNotFoundLoading(null);
      showToast(t("scanner.spool_fetch_failed"));
    }
  }, [pendingSpoolId, serverUrl, refreshSpools, showToast, t]);

  // ─── QR scan handler ──────────────────────────────────────────────────────
  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      // Scan-lock: ignore events while a resolution is in progress
      if (scanned || scanLockRef.current) return;

      const raw = String(data ?? "").trim();
      if (!raw) return;

      // Acquire scan-lock immediately to suppress duplicate camera events
      scanLockRef.current = true;
      setScanned(true);
      setLastResult(raw);

      // Legacy path: explicit Spoolman / FilaBase App-Link URL
      const spoolId = extractSpoolId(raw);
      if (spoolId !== null) {
        const found = spools.find((s) => s.id === spoolId);
        if (found) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          scanLockRef.current = false;
          router.push({ pathname: "/spool/[id]", params: { id: String(spoolId) } });
        } else {
          openNotFoundSheet(spoolId);
        }
        return;
      }

      // All other codes (QR, EAN, barcode) → unified offline-first flow
      void handleScanResult(raw, "barcode");
    },
    [scanned, spools, openNotFoundSheet, handleScanResult]
  );

  // ─── NFC scan handler ─────────────────────────────────────────────────────
  const handleNfcScan = useCallback(async () => {
    if (!nfcAvailability?.available) return;
    if (isScanningRef.current) {
      isScanningRef.current = false;
      await stopScan();
      setNfcState("idle");
      setNfcMessage("");
      return;
    }

    isScanningRef.current = true;
    setNfcState("scanning");
    setNfcMessage(t("scanner.nfc_scanning"));
    setNfcRaw(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const payload = await scanTagOnce();
      isScanningRef.current = false;
      setNfcRaw(payload.raw);

      if (payload.spoolId) {
        if (payload.isLocalId) {
          // FilaBro native tag (filabro:v1:<localId>): direct open — no sheet
          const found = spools.find((s) => s._localId === payload.spoolId);
          if (found) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setNfcState("success");
            setNfcMessage(t("scanner.nfc_success"));
            setTimeout(() => {
              router.push({ pathname: "/spool/[id]", params: { id: String(found.id) } });
              setNfcState("idle");
              setNfcMessage("");
            }, 600);
          } else {
            setNfcState("error");
            setNfcMessage(t("scanner.nfc_no_spool"));
          }
        } else {
          // Legacy numeric remote-ID tag — keep existing not-found sheet
          const spoolIdNum = parseInt(payload.spoolId, 10);
          const found = !isNaN(spoolIdNum) && spools.find((s) => s.id === spoolIdNum);
          if (found) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setNfcState("success");
            setNfcMessage(t("scanner.nfc_success"));
            setTimeout(() => {
              router.push({ pathname: "/spool/[id]", params: { id: String(spoolIdNum) } });
              setNfcState("idle");
              setNfcMessage("");
            }, 600);
          } else if (!isNaN(spoolIdNum)) {
            setNfcState("idle");
            openNotFoundSheet(spoolIdNum);
          } else {
            // NFC numeric parse failed — treat as plain-text lookup
            setNfcState("idle");
            scanLockRef.current = true;
            void handleScanResult(payload.raw, "nfc_remote");
          }
        }
      } else {
        // No spoolId extracted — try raw text as barcode lookup
        if (payload.raw.trim()) {
          setNfcState("idle");
          scanLockRef.current = true;
          void handleScanResult(payload.raw, "nfc_remote");
        } else {
          setNfcState("error");
          setNfcMessage(t("scanner.nfc_no_spool"));
        }
      }
    } catch (err: unknown) {
      isScanningRef.current = false;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err instanceof Error
        ? err.message
        : t("scanner.nfc_unavailable_error", { msg: String(err) });
      setNfcState("error");
      setNfcMessage(msg);
    }
  }, [nfcAvailability, spools, openNotFoundSheet, t]);

  const s = makeStyles(colors, isDark);

  // ─── Segmented control ────────────────────────────────────────────────────
  const ModeSwitcher = (
    <View
      style={[s.segControl, { backgroundColor: segBg, borderColor: segBorderColor }]}
      onLayout={(e) => setSwitcherWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[s.segPill, pillStyle, { width: pillWidth, pointerEvents: "none" }]}
      />

      {/* QR option */}
      <Animated.View style={[s.segOptionWrap, qrScaleStyle]}>
        <Pressable
          style={s.segOption}
          onPressIn={() => { qrScale.value = withSpring(0.91, { damping: 15, stiffness: 460 }); }}
          onPressOut={() => { qrScale.value = withSpring(1, { damping: 13, stiffness: 300 }); }}
          onPress={() => { if (mode !== "qr") { setMode("qr"); Haptics.selectionAsync(); } }}
        >
          <Ionicons name="qr-code-outline" size={13} color={mode === "qr" ? activeTextColor : inactiveTextColor} />
          <Text style={[s.segLabel, {
            color: mode === "qr" ? activeTextColor : inactiveTextColor,
            fontFamily: mode === "qr" ? "Inter_600SemiBold" : "Inter_400Regular",
          }]}>
            {t("scanner.mode_qr")}
          </Text>
        </Pressable>
      </Animated.View>

      {/* NFC option */}
      <Animated.View style={[s.segOptionWrap, nfcScaleStyle]}>
        <Pressable
          style={s.segOption}
          onPressIn={() => { nfcScale.value = withSpring(0.91, { damping: 15, stiffness: 460 }); }}
          onPressOut={() => { nfcScale.value = withSpring(1, { damping: 13, stiffness: 300 }); }}
          onPress={() => { if (mode !== "nfc") { setMode("nfc"); Haptics.selectionAsync(); } }}
        >
          <Ionicons name="radio-outline" size={13} color={mode === "nfc" ? activeTextColor : inactiveTextColor} />
          <Text style={[s.segLabel, {
            color: mode === "nfc" ? activeTextColor : inactiveTextColor,
            fontFamily: mode === "nfc" ? "Inter_600SemiBold" : "Inter_400Regular",
          }]}>
            {t("scanner.mode_nfc")}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );

  // ─── NFC sub-mode switcher (Read / Write) ─────────────────────────────────
  const NfcSubSwitcher = (
    <View
      style={[s.subSegControl, { backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)", borderColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)" }]}
      onLayout={(e) => setNfcSubWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[s.subSegPill, nfcSubPillStyle, { width: nfcSubPillWidth, pointerEvents: "none" }]}
      />
      <Animated.View style={[s.segOptionWrap, nfcReadScaleStyle]}>
        <Pressable
          style={s.subSegOption}
          onPressIn={() => { nfcReadScale.value = withSpring(0.91, { damping: 15, stiffness: 460 }); }}
          onPressOut={() => { nfcReadScale.value = withSpring(1, { damping: 13, stiffness: 300 }); }}
          onPress={() => { if (nfcSubMode !== "read") { setNfcSubMode("read"); Haptics.selectionAsync(); } }}
          testID="nfc-submode-read"
        >
          <Ionicons name="radio-outline" size={13} color={nfcSubMode === "read" ? "#fff" : (isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.38)")} />
          <Text style={[s.subSegLabel, {
            color: nfcSubMode === "read" ? "#fff" : (isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.38)"),
            fontFamily: nfcSubMode === "read" ? "Inter_600SemiBold" : "Inter_400Regular",
          }]}>
            {t("scanner.nfc_submode_read")}
          </Text>
        </Pressable>
      </Animated.View>
      <Animated.View style={[s.segOptionWrap, nfcWriteScaleStyle]}>
        <Pressable
          style={s.subSegOption}
          onPressIn={() => { nfcWriteScale.value = withSpring(0.91, { damping: 15, stiffness: 460 }); }}
          onPressOut={() => { nfcWriteScale.value = withSpring(1, { damping: 13, stiffness: 300 }); }}
          onPress={() => { if (nfcSubMode !== "write") { setNfcSubMode("write"); Haptics.selectionAsync(); } }}
          testID="nfc-submode-write"
        >
          <Ionicons name="pencil-outline" size={13} color={nfcSubMode === "write" ? "#fff" : (isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.38)")} />
          <Text style={[s.subSegLabel, {
            color: nfcSubMode === "write" ? "#fff" : (isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.38)"),
            fontFamily: nfcSubMode === "write" ? "Inter_600SemiBold" : "Inter_400Regular",
          }]}>
            {t("scanner.nfc_submode_write")}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );

  // ─── QR mode: permission loading ──────────────────────────────────────────
  if (mode === "qr" && !permission) {
    return (
      <View style={[s.container, { paddingTop: topPad }]}>
        <Text style={[s.header, { color: "#fff" }]}>{t("scanner.title")}</Text>
        {ModeSwitcher}
        <View style={s.centered}><ActivityIndicator color={colors.accent} size="large" /></View>
      </View>
    );
  }

  // ─── QR mode: permission denied ───────────────────────────────────────────
  if (mode === "qr" && !permission?.granted) {
    return (
      <View style={[s.container, { paddingTop: topPad }]}>
        <Text style={[s.header, { color: "#fff" }]}>{t("scanner.title")}</Text>
        {ModeSwitcher}
        <View style={s.centered}>
          <Ionicons name="camera-outline" size={64} color="rgba(255,255,255,0.35)" />
          <Text style={[s.permTitle, { color: "#fff" }]}>{t("scanner.camera_permission_title")}</Text>
          <Text style={[s.permText, { color: "rgba(255,255,255,0.6)" }]}>{t("scanner.camera_permission_text")}</Text>
          {!permission?.canAskAgain && Platform.OS !== "web" ? (
            <Text style={[s.permText, { color: "rgba(255,255,255,0.5)", marginTop: 8 }]}>
              {t("scanner.camera_permission_settings")}
            </Text>
          ) : (
            <Pressable
              style={({ pressed }) => [s.permBtn, { backgroundColor: colors.accent }, pressed && { opacity: 0.82 }]}
              onPress={requestPermission}
            >
              <Text style={s.permBtnText}>{t("scanner.camera_allow")}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // ─── SpoolMatchSheet (Fall 1 Treffer = single, Fall N Treffer = multiple) ───
  const isMultiMatch = scanResolution?.type === "multiple";
  const matchSpoolList: Spool[] =
    scanResolution?.type === "single" ? [scanResolution.spool]
    : scanResolution?.type === "multiple" ? scanResolution.spools
    : [];
  const matchCode = scanResolution?.code ?? "";

  function SpoolMatchRow({ spool, onOpen }: { spool: Spool; onOpen: () => void }) {
    const dotHex = spool.filament?.color_hex;
    const dotColor = dotHex ? (dotHex.startsWith("#") ? dotHex : `#${dotHex}`) : null;
    const meta = [spool.filament?.vendor?.name, spool.filament?.material].filter(Boolean).join(" · ");
    const name = spool._displayName ?? spool.filament?.name ?? `Spool #${spool.id}`;
    const weight = spool.remaining_weight != null ? `${Math.round(spool.remaining_weight)} g` : null;
    return (
      <Pressable
        style={({ pressed }) => [
          s.matchCard,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          pressed && { opacity: 0.75 },
        ]}
        onPress={onOpen}
      >
        <View style={s.matchCardLeft}>
          {dotColor ? (
            <View style={[s.matchColorDot, { backgroundColor: dotColor }]} />
          ) : (
            <View style={[s.matchColorDot, { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.surfaceBorder }]} />
          )}
          <View style={s.matchCardTexts}>
            <Text style={[s.matchCardName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
            {meta ? <Text style={[s.matchCardMeta, { color: colors.textSecondary }]} numberOfLines={1}>{meta}</Text> : null}
            {weight ? <Text style={[s.matchCardWeight, { color: colors.textTertiary }]}>{weight} {t("detail.remaining").toLowerCase()}</Text> : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </Pressable>
    );
  }

  function renderScanHistory() {
    if (scanHistory.length === 0) return null;
    return (
      <View style={s.historyContainer}>
        <Text style={[s.historyTitle, { color: colors.textSecondary }]}>{t("scanner.scan_history_title")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.historyScroll}>
          {scanHistory.map(entry => (
            <View key={entry.id} style={[s.historyCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
              <Text style={[s.historyTime, { color: colors.textTertiary }]}>{new Date(entry.timestamp).toLocaleTimeString()}</Text>
              <Text style={[s.historyCode, { color: colors.text }]} numberOfLines={1}>{entry.code}</Text>
              <Text style={[s.historyMeta, { color: colors.textSecondary }]}>
                {t(`scanner.scan_source_${entry.source}`)} • {t(`scanner.scan_res_${entry.resolutionType}`)}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  const SpoolMatchSheet = (
    <Modal
      visible={!!scanResolution && (scanResolution.type === "single" || scanResolution.type === "multiple")}
      transparent
      animationType="slide"
      onRequestClose={dismissMatchSheet}
    >
      <Pressable style={s.sheetBackdrop} onPress={dismissMatchSheet} />
      <View style={[s.sheetPanel, { backgroundColor: isDark ? colors.surfaceElevated : colors.surface }]}>
        <View style={s.sheetHandle} />
        <Text style={[s.sheetTitle, { color: colors.text }]}>
          {t("scanner.code_conflict_title")}
        </Text>
        <Text style={[s.sheetBody, { color: colors.warning || colors.textSecondary, marginBottom: 12, paddingHorizontal: 24, textAlign: "center" }]}>
          {t("scanner.code_conflict_single")}
        </Text>

        {/* Spool list (1 or N rows) */}
        <ScrollView style={s.matchScroll} showsVerticalScrollIndicator={false}>
          {matchSpoolList.map((spool) => (
            <SpoolMatchRow
              key={spool._localId ?? String(spool.id)}
              spool={spool}
              onOpen={() => {
                dismissMatchSheet();
                setTimeout(() => router.push({ pathname: "/spool/[id]", params: { id: String(spool.id) } }), 80);
              }}
            />
          ))}
        </ScrollView>

        <View style={{ height: 12 }} />

        {/* Edit Spool (nur wenn genau 1 Treffer) */}
        {scanResolution?.type === "single" && (
          <Pressable
            style={({ pressed }) => [
              s.sheetBtn,
              { backgroundColor: "transparent", borderColor: colors.surfaceBorder },
              pressed && { opacity: 0.65 },
            ]}
            onPress={() => {
              const sid = scanResolution.spool.id;
              dismissMatchSheet();
              setTimeout(() => router.push({ pathname: "/edit-spool", params: { id: String(sid) } }), 80);
            }}
          >
            <Ionicons name="pencil-outline" size={20} color={colors.textSecondary} />
            <Text style={[s.sheetBtnText, { color: colors.textSecondary }]}>
              {t("detail.edit")}
            </Text>
          </Pressable>
        )}

        {/* Create new spool with same code */}
        <Pressable
          style={({ pressed }) => [
            s.sheetBtn,
            { backgroundColor: "transparent", borderColor: colors.surfaceBorder },
            pressed && { opacity: 0.65 },
          ]}
          onPress={() => {
            dismissMatchSheet();
            setTimeout(() => router.push({ pathname: "/add-spool", params: { qrCode: matchCode } }), 80);
          }}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.textSecondary} />
          <Text style={[s.sheetBtnText, { color: colors.textSecondary }]}>
            {t("scanner.create_anyway")}
          </Text>
        </Pressable>

        {/* Merge-Vorbereitung: Später bereinigen (UI Dummy) */}
        <Pressable
          style={({ pressed }) => [
            s.sheetBtn,
            { backgroundColor: "transparent", borderColor: "transparent" },
            pressed && { opacity: 0.65 },
          ]}
          onPress={dismissMatchSheet}
        >
          <Ionicons name="git-merge-outline" size={20} color={colors.textTertiary} />
          <Text style={[s.sheetBtnText, { color: colors.textTertiary, textAlign: "left", flex: 1 }]}>
            {t("scanner.later_cleanup")}
          </Text>
        </Pressable>

        {/* Cancel */}
        <Pressable
          style={({ pressed }) => [
            s.sheetBtn,
            { backgroundColor: "transparent", borderColor: "transparent" },
            pressed && { opacity: 0.65 },
          ]}
          onPress={dismissMatchSheet}
        >
          <Text style={[s.sheetBtnText, { color: colors.textTertiary, textAlign: "center", flex: 1 }]}>
            {t("scanner.spool_cancel")}
          </Text>
        </Pressable>

        <View style={{ height: insets.bottom + 8 }} />
      </View>
    </Modal>
  );

  // ─── Shared overlay/sheet elements (rendered in both QR and NFC views) ────
  const NotFoundSheet = (
    <Modal
      visible={notFoundSheet}
      transparent
      animationType="slide"
      onRequestClose={dismissNotFoundSheet}
    >
      <Pressable style={s.sheetBackdrop} onPress={dismissNotFoundSheet} />
      <View style={[s.sheetPanel, { backgroundColor: isDark ? colors.surfaceElevated : colors.surface }]}>
        <View style={s.sheetHandle} />
        <Text style={[s.sheetTitle, { color: colors.text }]}>
          {t("scanner.spool_not_found_title")}
        </Text>
        <Text style={[s.sheetBody, { color: colors.textSecondary }]}>
          {t("scanner.spool_not_found_text")}
        </Text>

        {/* Create locally */}
        <Pressable
          style={({ pressed }) => [
            s.sheetBtn,
            { backgroundColor: `${colors.accent}18`, borderColor: `${colors.accent}50` },
            pressed && { opacity: 0.75 },
            notFoundLoading === "create" && { opacity: 0.65 },
          ]}
          onPress={handleCreateLocal}
          disabled={!!notFoundLoading}
        >
          {notFoundLoading === "create" ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
          )}
          <Text style={[s.sheetBtnText, { color: colors.accent }]}>
            {t("scanner.spool_created")}
          </Text>
        </Pressable>

        {/* Fetch from server — only shown if server is configured */}
        {!!serverUrl && (
          <Pressable
            style={({ pressed }) => [
              s.sheetBtn,
              { backgroundColor: `${colors.success}14`, borderColor: `${colors.success}40` },
              pressed && { opacity: 0.75 },
              notFoundLoading === "fetch" && { opacity: 0.65 },
            ]}
            onPress={handleFetchServer}
            disabled={!!notFoundLoading}
          >
            {notFoundLoading === "fetch" ? (
              <ActivityIndicator size="small" color={colors.success} />
            ) : (
              <Ionicons name="cloud-download-outline" size={20} color={colors.success} />
            )}
            <Text style={[s.sheetBtnText, { color: colors.success }]}>
              {t("scanner.spool_fetch_server")}
            </Text>
          </Pressable>
        )}

        {/* Cancel */}
        <Pressable
          style={({ pressed }) => [
            s.sheetBtn,
            { backgroundColor: "transparent", borderColor: colors.surfaceBorder },
            pressed && { opacity: 0.65 },
          ]}
          onPress={dismissNotFoundSheet}
          disabled={!!notFoundLoading}
        >
          <Text style={[s.sheetBtnText, { color: colors.textSecondary }]}>
            {t("scanner.spool_cancel")}
          </Text>
        </Pressable>

        <View style={{ height: insets.bottom + 8 }} />
      </View>
    </Modal>
  );

  const Toast = toastMsg ? (
    <Animated.View
      style={[
        s.toast,
        toastStyle,
        { bottom: bottomPad + 8, backgroundColor: isDark ? colors.surfaceElevated : colors.surface, pointerEvents: "none" },
      ]}
    >
      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
      <Text style={[s.toastText, { color: colors.text }]}>{toastMsg}</Text>
    </Animated.View>
  ) : null;

  // ─── QR camera view ───────────────────────────────────────────────────────
  if (mode === "qr") {
    return (
      <View style={s.container}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{
            barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "datamatrix"],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarcode}
        />
        <View style={[s.overlay, { paddingTop: topPad + 8, paddingBottom: bottomPad }]}>
          <Text style={s.overlayTitle}>{t("scanner.title")}</Text>
          {ModeSwitcher}

          <Animated.View style={[s.cameraContent, contentFadeStyle]}>
            <View style={s.viewfinder}>
              <Corner pos="tl" color={colors.accent} />
              <Corner pos="tr" color={colors.accent} />
              <Corner pos="bl" color={colors.accent} />
              <Corner pos="br" color={colors.accent} />
              <Text style={s.viewfinderHint}>{t("scanner.qr_hint")}</Text>
            </View>

            {lastResult && scanned && (
              <View style={[s.resultCard, { borderColor: `${colors.accent}50` }]}>
                <Text style={[s.resultLabel, { color: colors.accent }]}>{t("scanner.qr_last_scan")}</Text>
                <Text style={s.resultValue} numberOfLines={2}>{lastResult}</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                s.actionBtn,
                { backgroundColor: `${colors.accent}20`, borderColor: colors.accent },
                pressed && { opacity: 0.78 },
              ]}
              onPress={() => { setScanned(false); setLastResult(null); }}
            >
              <Ionicons name="refresh" size={20} color={colors.accent} />
              <Text style={[s.actionBtnText, { color: colors.accent }]}>{t("scanner.qr_scan_again")}</Text>
            </Pressable>
          </Animated.View>
        </View>

        {SpoolMatchSheet}
        {NotFoundSheet}
        {Toast}
      </View>
    );
  }

  // ─── NFC mode ─────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.nfcContainer, { paddingTop: topPad + 8, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 49 }]}>
        <Text style={[s.header, { color: colors.text }]}>{t("scanner.title")}</Text>
        {ModeSwitcher}
        {NfcSubSwitcher}

        <Animated.View style={[s.nfcContent, contentFadeStyle]}>
          {/* ─ Shared unavailability states ─ */}
          {nfcState === "checking" && (
            <>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={[s.nfcStatusText, { color: colors.textSecondary }]}>
                {t("scanner.nfc_checking")}
              </Text>
            </>
          )}

          {nfcState !== "checking" && nfcAvailability && !nfcAvailability.available && nfcAvailability.reason === "expo_go" && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.nfcInfoCard}>
              <View style={[s.nfcInfoBox, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}40` }]}>
                <Ionicons name="information-circle-outline" size={36} color={colors.warning} />
                <Text style={[s.nfcInfoTitle, { color: colors.text }]}>{t("scanner.nfc_unavailable_expo_go_title")}</Text>
                <Text style={[s.nfcInfoBody, { color: colors.textSecondary }]}>{t("scanner.nfc_unavailable_expo_go_body")}</Text>
              </View>
            </ScrollView>
          )}

          {nfcState !== "checking" && nfcAvailability && !nfcAvailability.available && nfcAvailability.reason === "no_hardware" && (
            <View style={[s.nfcInfoBox, { backgroundColor: `${colors.textTertiary}12`, borderColor: colors.surfaceBorder }]}>
              <Ionicons name="radio-outline" size={36} color={colors.textTertiary} />
              <Text style={[s.nfcInfoTitle, { color: colors.text }]}>{t("scanner.nfc_unavailable_no_hw")}</Text>
            </View>
          )}

          {nfcState !== "checking" && nfcAvailability && !nfcAvailability.available && nfcAvailability.reason === "disabled" && (
            <View style={[s.nfcInfoBox, { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}30` }]}>
              <Ionicons name="radio-outline" size={36} color={colors.warning} />
              <Text style={[s.nfcInfoTitle, { color: colors.text }]}>{t("scanner.nfc_unavailable_disabled")}</Text>
            </View>
          )}

          {/* ─ NFC Read mode ─ */}
          {nfcAvailability?.available &&
            nfcState !== "checking" &&
            nfcSubMode === "read" && (
              <>
                <View
                  style={[
                    s.nfcIcon,
                    {
                      backgroundColor:
                        nfcState === "scanning"
                          ? `${colors.accent}22`
                          : nfcState === "success"
                            ? `${colors.success}20`
                            : nfcState === "error"
                              ? `${colors.error}15`
                              : `${colors.accent}12`,
                      borderColor:
                        nfcState === "scanning"
                          ? colors.accent
                          : nfcState === "success"
                            ? colors.success
                            : nfcState === "error"
                              ? colors.error
                              : colors.surfaceBorder,
                    },
                  ]}
                >
                  {nfcState === "scanning" ? (
                    <ActivityIndicator color={colors.accent} size="large" />
                  ) : (
                    <Ionicons
                      name={
                        nfcState === "success"
                          ? "checkmark-circle"
                          : nfcState === "error"
                            ? "alert-circle"
                            : "radio-outline"
                      }
                      size={56}
                      color={
                        nfcState === "success"
                          ? colors.success
                          : nfcState === "error"
                            ? colors.error
                            : colors.accent
                      }
                    />
                  )}
                </View>

                {nfcMessage !== "" && (
                  <Text
                    style={[
                      s.nfcStatusText,
                      {
                        color:
                          nfcState === "error"
                            ? colors.error
                            : nfcState === "success"
                              ? colors.success
                              : colors.textSecondary,
                      },
                    ]}
                  >
                    {nfcMessage}
                  </Text>
                )}

                {nfcRaw && nfcState !== "scanning" && (
                  <View
                    style={[
                      s.rawCard,
                      { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
                    ]}
                  >
                    <Text style={[s.rawLabel, { color: colors.textTertiary }]}>
                      {t("scanner.nfc_raw_data")}
                    </Text>
                    <Text
                      style={[s.rawValue, { color: colors.textSecondary }]}
                      numberOfLines={3}
                    >
                      {nfcRaw}
                    </Text>
                  </View>
                )}

                <Pressable
                  style={({ pressed }) => [
                    s.actionBtn,
                    {
                      backgroundColor:
                        nfcState === "scanning"
                          ? `${colors.error}30`
                          : `${colors.accent}22`,
                      borderColor:
                        nfcState === "scanning" ? colors.error : colors.accent,
                    },
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={
                    nfcState === "scanning"
                      ? handleNfcScan
                      : () => {
                        setNfcState("idle");
                        setNfcMessage("");
                        setNfcRaw(null);
                        handleNfcScan();
                      }
                  }
                >
                  <Ionicons
                    name={
                      nfcState === "scanning"
                        ? "close-circle-outline"
                        : "radio-outline"
                    }
                    size={20}
                    color={
                      nfcState === "scanning" ? colors.error : colors.accent
                    }
                  />
                  <Text
                    style={[
                      s.actionBtnText,
                      {
                        color:
                          nfcState === "scanning" ? colors.error : colors.accent,
                      },
                    ]}
                  >
                    {nfcState === "scanning"
                      ? t("scanner.nfc_stop")
                      : t("scanner.nfc_start_scan")}
                  </Text>
                </Pressable>
              </>
            )}

          {/* ─ NFC Write mode ─ */}
          {nfcAvailability?.available &&
            nfcState !== "checking" &&
            nfcSubMode === "write" && (
              <View style={s.writeContainer}>
                <Text style={[s.writeTitle, { color: colors.text }]}>
                  {t("scanner.nfc_write_pick_spool")}
                </Text>
                <Text style={[s.writeSubtitle, { color: colors.textSecondary }]}>
                  {t("scanner.nfc_write_subtitle")}
                </Text>

                {activeSpools.length === 0 ? (
                  <View
                    style={[
                      s.nfcInfoBox,
                      {
                        backgroundColor: `${colors.textTertiary}10`,
                        borderColor: colors.surfaceBorder,
                        marginTop: 12,
                      },
                    ]}
                  >
                    <Ionicons
                      name="layers-outline"
                      size={32}
                      color={colors.textTertiary}
                    />
                    <Text
                      style={[
                        s.nfcInfoTitle,
                        { color: colors.textSecondary, fontSize: 15 },
                      ]}
                    >
                      {t("scanner.nfc_write_no_spools")}
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    style={s.spoolPickerScroll}
                    showsVerticalScrollIndicator={false}
                  >
                    {activeSpools.map((spool) => {
                      const isSelected = writeLocalId === spool._localId;
                      const dotHex = spool.filament?.color_hex;
                      const dotColor = dotHex
                        ? dotHex.startsWith("#")
                          ? dotHex
                          : `#${dotHex}`
                        : null;
                      return (
                        <Pressable
                          key={spool._localId}
                          style={({ pressed }) => [
                            s.spoolPickerRow,
                            {
                              backgroundColor: isSelected
                                ? `${colors.accent}18`
                                : colors.surface,
                              borderColor: isSelected
                                ? colors.accent
                                : colors.surfaceBorder,
                            },
                            pressed && { opacity: 0.75 },
                          ]}
                          onPress={() => {
                            setWriteLocalId(spool._localId ?? null);
                            Haptics.selectionAsync();
                          }}
                          testID={`write-spool-${spool._localId}`}
                        >
                          <View style={s.spoolPickerLeft}>
                            {dotColor ? (
                              <View
                                style={[
                                  s.spoolColorDot,
                                  { backgroundColor: dotColor },
                                ]}
                              />
                            ) : (
                              <View
                                style={[
                                  s.spoolColorDot,
                                  {
                                    backgroundColor: colors.surfaceElevated,
                                    borderWidth: 1,
                                    borderColor: colors.surfaceBorder,
                                  },
                                ]}
                              />
                            )}
                            <View style={s.spoolPickerTexts}>
                              <Text
                                style={[
                                  s.spoolPickerName,
                                  {
                                    color: isSelected
                                      ? colors.accent
                                      : colors.text,
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {spool._displayName ??
                                  spool.filament?.name ??
                                  `Spool #${spool.id}`}
                              </Text>
                              <Text
                                style={[
                                  s.spoolPickerSub,
                                  { color: colors.textSecondary },
                                ]}
                                numberOfLines={1}
                              >
                                {[
                                  spool.filament?.vendor?.name,
                                  spool.filament?.material,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </Text>
                            </View>
                          </View>
                          {isSelected && (
                            <Ionicons
                              name="checkmark-circle"
                              size={20}
                              color={colors.accent}
                            />
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}

                {writeLocalId && (
                  <Pressable
                    style={({ pressed }) => [
                      s.actionBtn,
                      {
                        backgroundColor: `${colors.accent}22`,
                        borderColor: colors.accent,
                        marginTop: 12,
                      },
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={() => {
                      if (!writeLocalId) return;
                      router.push({
                        pathname: "/nfc-write",
                        params: { localId: writeLocalId },
                      });
                    }}
                    testID="nfc-write-go"
                  >
                    <Ionicons name="pencil" size={20} color={colors.accent} />
                    <Text style={[s.actionBtnText, { color: colors.accent }]}>
                      {t("scanner.nfc_write_go")}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          {renderScanHistory()}
        </Animated.View>
      </View>

      {SpoolMatchSheet}
      {NotFoundSheet}
      {Toast}
    </View>
  );
}

// ─── Corner brackets for QR viewfinder ───────────────────────────────────────
function Corner({
  pos,
  color,
}: {
  pos: "tl" | "tr" | "bl" | "br";
  color: string;
}) {
  const style: Record<string, number | string> = {
    position: "absolute",
    width: 26,
    height: 26,
    borderColor: color,
    borderWidth: 2.5,
  };
  if (pos === "tl") {
    style.top = 0;
    style.left = 0;
    style.borderRightWidth = 0;
    style.borderBottomWidth = 0;
    style.borderTopLeftRadius = 5;
  }
  if (pos === "tr") {
    style.top = 0;
    style.right = 0;
    style.borderLeftWidth = 0;
    style.borderBottomWidth = 0;
    style.borderTopRightRadius = 5;
  }
  if (pos === "bl") {
    style.bottom = 0;
    style.left = 0;
    style.borderRightWidth = 0;
    style.borderTopWidth = 0;
    style.borderBottomLeftRadius = 5;
  }
  if (pos === "br") {
    style.bottom = 0;
    style.right = 0;
    style.borderLeftWidth = 0;
    style.borderTopWidth = 0;
    style.borderBottomRightRadius = 5;
  }
  return <View style={style as object} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(
  colors: typeof import("@/constants/colors").default.dark,
  isDark: boolean
) {
  const sheetBtnBase = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
  };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#000",
    },

    // Header
    header: {
      fontSize: 32,
      fontFamily: "Inter_700Bold",
      letterSpacing: -1,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 18,
    },

    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      paddingHorizontal: 32,
    },
    permTitle: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      textAlign: "center",
    },
    permText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 22,
    },
    permBtn: {
      borderRadius: 14,
      paddingHorizontal: 32,
      paddingVertical: 14,
      marginTop: 8,
    },
    permBtnText: {
      color: "#000",
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
    },

    // ─── Segmented control ───────────────────────────────────────────────────
    segControl: {
      flexDirection: "row",
      alignSelf: "center",
      borderRadius: 14,
      padding: 4,
      borderWidth: 1,
      position: "relative",
      overflow: "hidden",
      minWidth: 220,
    },
    segPill: {
      position: "absolute",
      top: 4,
      bottom: 4,
      left: 4,
      borderRadius: 10,
      backgroundColor: "rgba(59,130,246,0.80)",
      shadowColor: "#3B82F6",
      shadowOpacity: 0.28,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    segOptionWrap: {
      flex: 1,
      zIndex: 1,
    },
    segOption: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    segLabel: {
      fontSize: 13,
      lineHeight: 14,
      includeFontPadding: false,
      letterSpacing: 0.05,
    },

    // ─── QR overlay ──────────────────────────────────────────────────────────
    overlay: {
      flex: 1,
      alignItems: "center",
      paddingHorizontal: 24,
      gap: 24,
    },
    overlayTitle: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      alignSelf: "flex-start",
    },
    cameraContent: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
      width: "100%",
    },
    viewfinder: {
      width: 224,
      height: 224,
      position: "relative",
      alignItems: "center",
      justifyContent: "flex-end",
      paddingBottom: 12,
    },
    viewfinderHint: {
      color: "rgba(255,255,255,0.55)",
      fontSize: 13,
      fontFamily: "Inter_400Regular",
    },
    resultCard: {
      backgroundColor: "rgba(0,0,0,0.75)",
      borderRadius: 12,
      padding: 14,
      width: "100%",
      gap: 4,
      borderWidth: 1,
    },
    resultLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
    },
    resultValue: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: "#fff",
    },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 14,
      paddingHorizontal: 24,
      paddingVertical: 13,
      borderWidth: 1.5,
    },
    actionBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },

    // ─── NFC sub-mode switcher ────────────────────────────────────────────────
    subSegControl: {
      flexDirection: "row",
      alignSelf: "center",
      borderRadius: 11,
      padding: 3,
      borderWidth: 1,
      position: "relative",
      overflow: "hidden",
      minWidth: 180,
    },
    subSegPill: {
      position: "absolute",
      top: 3,
      bottom: 3,
      left: 3,
      borderRadius: 8,
      backgroundColor: "rgba(59,130,246,0.75)",
      shadowColor: "#3B82F6",
      shadowOpacity: 0.22,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    subSegOption: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
    },
    subSegLabel: {
      fontSize: 12,
      lineHeight: 13,
      includeFontPadding: false,
      letterSpacing: 0.05,
    },

    // ─── NFC Write mode ───────────────────────────────────────────────────────
    writeContainer: {
      flex: 1,
      width: "100%",
      gap: 8,
    },
    writeTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.3,
    },
    writeSubtitle: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      lineHeight: 19,
      marginBottom: 4,
    },
    spoolPickerScroll: {
      flex: 1,
    },
    spoolPickerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 6,
    },
    spoolPickerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    spoolColorDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      flexShrink: 0,
    },
    spoolPickerTexts: {
      flex: 1,
      gap: 2,
    },
    spoolPickerName: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
    },
    spoolPickerSub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
    },

    // ─── NFC mode ────────────────────────────────────────────────────────────
    nfcContainer: {
      flex: 1,
      paddingHorizontal: 24,
      gap: 20,
    },
    nfcContent: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
    },
    nfcIcon: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
    },
    nfcStatusText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      textAlign: "center",
      paddingHorizontal: 20,
      lineHeight: 22,
    },
    nfcInfoCard: {
      padding: 8,
    },
    nfcInfoBox: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 24,
      alignItems: "center",
      gap: 14,
    },
    nfcInfoTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      textAlign: "center",
    },
    nfcInfoBody: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
    },
    rawCard: {
      borderRadius: 12,
      borderWidth: 1,
      padding: 12,
      width: "100%",
      gap: 4,
    },
    rawLabel: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
    },
    rawValue: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      lineHeight: 18,
    },

    // ─── "Spool not found" bottom sheet ──────────────────────────────────────
    sheetBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.52)",
    },
    sheetPanel: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 12,
      gap: 12,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: -4 },
      elevation: 20,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)",
      alignSelf: "center",
      marginBottom: 6,
    },
    sheetTitle: {
      fontSize: 19,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.3,
    },
    sheetBody: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      lineHeight: 20,
      marginBottom: 4,
    },
    sheetBtn: {
      ...sheetBtnBase,
    },
    sheetBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },

    // ─── SpoolMatchSheet elements ─────────────────────────────────────────────
    matchCard: {
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    matchCardLeft: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
    },
    matchColorDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      flexShrink: 0,
    },
    matchCardTexts: {
      flex: 1,
      gap: 2,
    },
    matchCardName: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    matchCardMeta: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
    },
    matchCardWeight: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
    },

    // ─── Toast ────────────────────────────────────────────────────────────────
    toast: {
      position: "absolute",
      left: 20,
      right: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 14,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    toastText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      flex: 1,
    },

    // ─── Scan History ────────────────────────────────────────────────────────
    historyContainer: {
      gap: 8,
      paddingBottom: 20,
      width: "100%",
    },
    historyTitle: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      paddingHorizontal: 8,
    },
    historyScroll: {
      gap: 8,
      paddingHorizontal: 8,
    },
    historyCard: {
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      minWidth: 140,
      maxWidth: 200,
      gap: 2,
    },
    historyTime: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
    },
    historyCode: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    historyMeta: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    matchScroll: {
      maxHeight: 280,
      width: "100%",
    },
  });
}