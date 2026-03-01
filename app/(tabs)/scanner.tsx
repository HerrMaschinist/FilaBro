import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
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
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { spools } = useApp();

  const [mode, setMode] = useState<ScanMode>("qr");

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const [nfcAvailability, setNfcAvailability] = useState<NfcAvailability | null>(null);
  const [nfcState, setNfcState] = useState<NfcScanState>("idle");
  const [nfcMessage, setNfcMessage] = useState("");
  const [nfcRaw, setNfcRaw] = useState<string | null>(null);
  const isScanningRef = useRef(false);

  const pillAnim = useSharedValue(0);
  const [switcherWidth, setSwitcherWidth] = useState(220);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  useEffect(() => {
    pillAnim.value = withSpring(mode === "qr" ? 0 : 1, {
      damping: 22,
      stiffness: 260,
    });
  }, [mode]);

  useEffect(() => {
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

  const pillWidth = (switcherWidth - 6) / 2;

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillAnim.value * pillWidth }],
  }));

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
          Alert.alert(
            t("scanner.qr_spool_found"),
            t("scanner.qr_spool_found_msg", { id: spoolId }),
            [
              {
                text: t("scanner.qr_open"),
                onPress: () =>
                  router.push({ pathname: "/spool/[id]", params: { id: String(spoolId) } }),
              },
              { text: t("common.cancel"), onPress: () => setScanned(false) },
            ]
          );
        }
      } else {
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
          Alert.alert(
            t("scanner.qr_no_match"),
            t("scanner.qr_no_match_msg", { data: data.slice(0, 80) }),
            [{ text: t("scanner.qr_scan_again"), onPress: () => setScanned(false) }]
          );
        }
      }
    },
    [scanned, spools, t]
  );

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
        setNfcState("success");
        setNfcMessage(t("scanner.nfc_success"));
        setTimeout(() => {
          router.push({ pathname: "/spool/[id]", params: { id: payload.spoolId! } });
          setNfcState("idle");
          setNfcMessage("");
        }, 600);
      } else {
        setNfcState("error");
        setNfcMessage(t("scanner.nfc_no_spool"));
      }
    } catch (err: unknown) {
      isScanningRef.current = false;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err instanceof Error ? err.message : t("scanner.nfc_unavailable_error", { msg: String(err) });
      setNfcState("error");
      setNfcMessage(msg);
    }
  }, [nfcAvailability, t]);

  const s = makeStyles(colors);

  const ModeSwitcher = (
    <View
      style={[s.modeSwitcher, { backgroundColor: "rgba(0,0,0,0.55)" }]}
      onLayout={(e) => setSwitcherWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          s.modePill,
          pillStyle,
          { width: pillWidth, backgroundColor: colors.accent, pointerEvents: "none" },
        ]}
      />
      {(["qr", "nfc"] as ScanMode[]).map((m) => (
        <Pressable
          key={m}
          style={s.modeBtn}
          onPress={() => {
            setMode(m);
            Haptics.selectionAsync();
          }}
        >
          <Ionicons
            name={m === "qr" ? "qr-code-outline" : "radio-outline"}
            size={15}
            color={mode === m ? "#000" : "rgba(255,255,255,0.7)"}
          />
          <Text style={[s.modeBtnText, mode === m && s.modeBtnTextActive]}>
            {m === "qr" ? t("scanner.mode_qr") : t("scanner.mode_nfc")}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  if (mode === "qr") {
    if (!permission) {
      return (
        <View style={[s.container, { paddingTop: topPad }]}>
          <Text style={[s.header, { color: "#fff" }]}>{t("scanner.title")}</Text>
          {ModeSwitcher}
          <View style={s.centered}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={[s.container, { paddingTop: topPad }]}>
          <Text style={[s.header, { color: "#fff" }]}>{t("scanner.title")}</Text>
          {ModeSwitcher}
          <View style={s.centered}>
            <Ionicons name="camera-outline" size={64} color="rgba(255,255,255,0.35)" />
            <Text style={[s.permTitle, { color: "#fff" }]}>
              {t("scanner.camera_permission_title")}
            </Text>
            <Text style={[s.permText, { color: "rgba(255,255,255,0.6)" }]}>
              {t("scanner.camera_permission_text")}
            </Text>
            {!permission.canAskAgain && Platform.OS !== "web" ? (
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

    return (
      <View style={s.container}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{
            barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "datamatrix"],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarcode}
        />
        <View
          style={[
            s.overlay,
            {
              paddingTop: topPad + 8,
              paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90,
            },
          ]}
        >
          <Text style={s.overlayTitle}>{t("scanner.title")}</Text>

          {ModeSwitcher}

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
              {
                backgroundColor: `${colors.accent}20`,
                borderColor: colors.accent,
              },
              pressed && { opacity: 0.78 },
            ]}
            onPress={() => { setScanned(false); setLastResult(null); }}
          >
            <Ionicons name="refresh" size={20} color={colors.accent} />
            <Text style={[s.actionBtnText, { color: colors.accent }]}>{t("scanner.qr_scan_again")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          s.nfcContainer,
          {
            paddingTop: topPad + 8,
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90,
          },
        ]}
      >
        <Text style={[s.header, { color: colors.text }]}>{t("scanner.title")}</Text>

        {ModeSwitcher}

        <View style={s.nfcContent}>
          {nfcState === "checking" && (
            <>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={[s.nfcStatusText, { color: colors.textSecondary }]}>
                {t("scanner.nfc_checking")}
              </Text>
            </>
          )}

          {nfcState !== "checking" && nfcAvailability && !nfcAvailability.available && nfcAvailability.reason === "expo_go" && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.nfcInfoCard}
            >
              <View style={[s.nfcInfoBox, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}40` }]}>
                <Ionicons name="information-circle-outline" size={36} color={colors.warning} />
                <Text style={[s.nfcInfoTitle, { color: colors.text }]}>
                  {t("scanner.nfc_unavailable_expo_go_title")}
                </Text>
                <Text style={[s.nfcInfoBody, { color: colors.textSecondary }]}>
                  {t("scanner.nfc_unavailable_expo_go_body")}
                </Text>
              </View>
            </ScrollView>
          )}

          {nfcState !== "checking" && nfcAvailability && !nfcAvailability.available && nfcAvailability.reason === "no_hardware" && (
            <View style={[s.nfcInfoBox, { backgroundColor: `${colors.textTertiary}12`, borderColor: `${colors.surfaceBorder}` }]}>
              <Ionicons name="radio-outline" size={36} color={colors.textTertiary} />
              <Text style={[s.nfcInfoTitle, { color: colors.text }]}>
                {t("scanner.nfc_unavailable_no_hw")}
              </Text>
            </View>
          )}

          {nfcState !== "checking" && nfcAvailability && !nfcAvailability.available && nfcAvailability.reason === "disabled" && (
            <View style={[s.nfcInfoBox, { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}30` }]}>
              <Ionicons name="radio-outline" size={36} color={colors.warning} />
              <Text style={[s.nfcInfoTitle, { color: colors.text }]}>
                {t("scanner.nfc_unavailable_disabled")}
              </Text>
            </View>
          )}

          {nfcAvailability?.available && nfcState !== "checking" && (
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
                <View style={[s.rawCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
                  <Text style={[s.rawLabel, { color: colors.textTertiary }]}>
                    {t("scanner.nfc_raw_data")}
                  </Text>
                  <Text style={[s.rawValue, { color: colors.textSecondary }]} numberOfLines={3}>
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
                onPress={nfcState === "scanning" ? handleNfcScan : () => {
                  setNfcState("idle");
                  setNfcMessage("");
                  setNfcRaw(null);
                  handleNfcScan();
                }}
              >
                <Ionicons
                  name={nfcState === "scanning" ? "close-circle-outline" : "radio-outline"}
                  size={20}
                  color={nfcState === "scanning" ? colors.error : colors.accent}
                />
                <Text
                  style={[
                    s.actionBtnText,
                    { color: nfcState === "scanning" ? colors.error : colors.accent },
                  ]}
                >
                  {nfcState === "scanning"
                    ? t("scanner.nfc_stop")
                    : t("scanner.nfc_start_scan")}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function Corner({ pos, color }: { pos: "tl" | "tr" | "bl" | "br"; color: string }) {
  const style: Record<string, number | string> = {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: color,
    borderWidth: 3,
  };
  if (pos === "tl") { style.top = 0; style.left = 0; style.borderRightWidth = 0; style.borderBottomWidth = 0; style.borderTopLeftRadius = 4; }
  if (pos === "tr") { style.top = 0; style.right = 0; style.borderLeftWidth = 0; style.borderBottomWidth = 0; style.borderTopRightRadius = 4; }
  if (pos === "bl") { style.bottom = 0; style.left = 0; style.borderRightWidth = 0; style.borderTopWidth = 0; style.borderBottomLeftRadius = 4; }
  if (pos === "br") { style.bottom = 0; style.right = 0; style.borderLeftWidth = 0; style.borderTopWidth = 0; style.borderBottomRightRadius = 4; }
  return <View style={style as object} />;
}

function makeStyles(colors: typeof import("@/constants/colors").default.dark) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#000",
    },
    header: {
      fontSize: 32,
      fontFamily: "Inter_700Bold",
      letterSpacing: -1,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
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
    modeSwitcher: {
      flexDirection: "row",
      alignSelf: "center",
      borderRadius: 12,
      padding: 3,
      position: "relative",
      overflow: "hidden",
    },
    modePill: {
      position: "absolute",
      top: 3,
      bottom: 3,
      left: 3,
      borderRadius: 9,
    },
    modeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 9,
      zIndex: 1,
    },
    modeBtnText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: "rgba(255,255,255,0.7)",
    },
    modeBtnTextActive: {
      color: "#000",
    },
    overlay: {
      flex: 1,
      alignItems: "center",
      paddingHorizontal: 24,
      gap: 20,
    },
    overlayTitle: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      alignSelf: "flex-start",
    },
    viewfinder: {
      width: 220,
      height: 220,
      position: "relative",
      alignItems: "center",
      justifyContent: "flex-end",
      paddingBottom: 10,
    },
    viewfinderHint: {
      color: "rgba(255,255,255,0.6)",
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
    nfcContainer: {
      flex: 1,
      paddingHorizontal: 24,
      gap: 16,
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
  });
}
