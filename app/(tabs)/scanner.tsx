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
import {
  checkNfcAvailability,
  scanTagOnce,
  stopScan,
  type NfcAvailability,
} from "@/src/features/nfc";

type ScanMode = "qr" | "nfc";
type NfcScanState = "idle" | "checking" | "scanning" | "success" | "error";

function extractSpoolId(data: string): number | null {
  if (/^\d+$/.test(data.trim())) return parseInt(data.trim(), 10);
  const urlMatch = data.match(/\/spool[s]?\/(\d+)/i);
  if (urlMatch) return parseInt(urlMatch[1], 10);
  const qMatch = data.match(/[?&](?:spool_?id|id)=(\d+)/i);
  if (qMatch) return parseInt(qMatch[1], 10);
  return null;
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

  // "Spool not found" sheet state
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
  }, [mode]);

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

  // ─── "Spool not found" handlers ───────────────────────────────────────────
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
      if (scanned) return;
      setScanned(true);
      setLastResult(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const spoolId = extractSpoolId(data);
      if (spoolId !== null) {
        const found = spools.find((s) => s.id === spoolId);
        if (found) {
          router.push({ pathname: "/spool/[id]", params: { id: String(spoolId) } });
        } else {
          openNotFoundSheet(spoolId);
        }
      } else {
        // No numeric ID: try text search
        const q = data.toLowerCase();
        const matches = spools.filter(
          (s) =>
            s.filament?.name?.toLowerCase().includes(q) ||
            s.filament?.vendor?.name?.toLowerCase().includes(q) ||
            String(s.id) === q.trim()
        );
        if (matches.length === 1) {
          router.push({ pathname: "/spool/[id]", params: { id: String(matches[0].id) } });
        } else {
          // No match at all: show last result and allow re-scan
          setScanned(false);
        }
      }
    },
    [scanned, spools, openNotFoundSheet]
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNfcRaw(payload.raw);

      if (payload.spoolId) {
        const spoolIdNum = parseInt(payload.spoolId, 10);
        const found = !isNaN(spoolIdNum) && spools.find((s) => s.id === spoolIdNum);
        if (found) {
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
          setNfcState("error");
          setNfcMessage(t("scanner.nfc_no_spool"));
        }
      } else {
        setNfcState("error");
        setNfcMessage(t("scanner.nfc_no_spool"));
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
            {t("scanner.spool_create_locally")}
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

        {NotFoundSheet}
        {Toast}
      </View>
    );
  }

  // ─── NFC mode ─────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.nfcContainer, { paddingTop: topPad + 8, paddingBottom: bottomPad }]}>
        <Text style={[s.header, { color: colors.text }]}>{t("scanner.title")}</Text>
        {ModeSwitcher}

        <Animated.View style={[s.nfcContent, contentFadeStyle]}>
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

          {nfcAvailability?.available && nfcState !== "checking" && (
            <>
              <View style={[s.nfcIcon, {
                backgroundColor:
                  nfcState === "scanning" ? `${colors.accent}22`
                  : nfcState === "success" ? `${colors.success}20`
                  : nfcState === "error" ? `${colors.error}15`
                  : `${colors.accent}12`,
                borderColor:
                  nfcState === "scanning" ? colors.accent
                  : nfcState === "success" ? colors.success
                  : nfcState === "error" ? colors.error
                  : colors.surfaceBorder,
              }]}>
                {nfcState === "scanning" ? (
                  <ActivityIndicator color={colors.accent} size="large" />
                ) : (
                  <Ionicons
                    name={
                      nfcState === "success" ? "checkmark-circle"
                      : nfcState === "error" ? "alert-circle"
                      : "radio-outline"
                    }
                    size={56}
                    color={
                      nfcState === "success" ? colors.success
                      : nfcState === "error" ? colors.error
                      : colors.accent
                    }
                  />
                )}
              </View>

              {nfcMessage !== "" && (
                <Text style={[s.nfcStatusText, {
                  color:
                    nfcState === "error" ? colors.error
                    : nfcState === "success" ? colors.success
                    : colors.textSecondary,
                }]}>
                  {nfcMessage}
                </Text>
              )}

              {nfcRaw && nfcState !== "scanning" && (
                <View style={[s.rawCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
                  <Text style={[s.rawLabel, { color: colors.textTertiary }]}>{t("scanner.nfc_raw_data")}</Text>
                  <Text style={[s.rawValue, { color: colors.textSecondary }]} numberOfLines={3}>{nfcRaw}</Text>
                </View>
              )}

              <Pressable
                style={({ pressed }) => [
                  s.actionBtn,
                  {
                    backgroundColor: nfcState === "scanning" ? `${colors.error}30` : `${colors.accent}22`,
                    borderColor: nfcState === "scanning" ? colors.error : colors.accent,
                  },
                  pressed && { opacity: 0.75 },
                ]}
                onPress={nfcState === "scanning"
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
                  name={nfcState === "scanning" ? "close-circle-outline" : "radio-outline"}
                  size={20}
                  color={nfcState === "scanning" ? colors.error : colors.accent}
                />
                <Text style={[s.actionBtnText, { color: nfcState === "scanning" ? colors.error : colors.accent }]}>
                  {nfcState === "scanning" ? t("scanner.nfc_stop") : t("scanner.nfc_start_scan")}
                </Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      </View>

      {NotFoundSheet}
      {Toast}
    </View>
  );
}

// ─── Corner brackets for QR viewfinder ───────────────────────────────────────
function Corner({ pos, color }: { pos: "tl" | "tr" | "bl" | "br"; color: string }) {
  const style: Record<string, number | string> = {
    position: "absolute",
    width: 26,
    height: 26,
    borderColor: color,
    borderWidth: 2.5,
  };
  if (pos === "tl") { style.top = 0; style.left = 0; style.borderRightWidth = 0; style.borderBottomWidth = 0; style.borderTopLeftRadius = 5; }
  if (pos === "tr") { style.top = 0; style.right = 0; style.borderLeftWidth = 0; style.borderBottomWidth = 0; style.borderTopRightRadius = 5; }
  if (pos === "bl") { style.bottom = 0; style.left = 0; style.borderRightWidth = 0; style.borderTopWidth = 0; style.borderBottomLeftRadius = 5; }
  if (pos === "br") { style.bottom = 0; style.right = 0; style.borderLeftWidth = 0; style.borderTopWidth = 0; style.borderBottomRightRadius = 5; }
  return <View style={style as object} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(colors: typeof import("@/constants/colors").default.dark, isDark: boolean) {
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
    // Teil 2 fix: alignItems center on the row + includeFontPadding false
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
      lineHeight: 14,            // tight: no extra vertical space above/below glyph
      includeFontPadding: false, // Android: removes top gap added by font metrics
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
      lineHeight: 21,
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
  });
}
