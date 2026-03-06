/**
 * app/nfc-write.tsx
 *
 * NFC Tag Provisioning Screen
 *
 * Route params:
 *   localId — the spoolLocalId to encode into the NFC tag (required)
 *
 * Flow:
 *   1. Verify NFC is available on this device
 *   2. User taps "Write Tag" → app enters write mode
 *   3. User holds their NFC tag to the back of the phone
 *   4. Tag is written with "filabro:v1:<localId>"
 *   5. Success state shown; user can go back or write another tag for the same spool
 *
 * Platform safety:
 *   - Web / Expo Go → shows a clear "not supported" state; never crashes
 *   - iOS with NfcTech.Ndef → handles pre-formatted tags (most NTAG213/215/216 stickers)
 *   - Android → additionally tries NfcTech.NdefFormatable for blank unformatted tags
 */
import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  cancelAnimation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/contexts/AppContext";
import {
  checkNfcAvailability,
  writeTag,
  formatTagPayload,
  type NfcAvailability,
} from "@/src/features/nfc";

type WriteState =
  | "checking_nfc"     // initial NFC availability check
  | "unavailable"      // NFC not available (Expo Go, no hardware, disabled)
  | "idle"             // ready; waiting for user to tap "Write Tag"
  | "writing"          // NFC session active; waiting for tag
  | "success"          // tag written successfully
  | "error";           // write failed

export default function NfcWriteScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { localId } = useLocalSearchParams<{ localId: string }>();

  const [writeState, setWriteState] = useState<WriteState>("checking_nfc");
  const [nfcAvailability, setNfcAvailability] = useState<NfcAvailability | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [writtenPayload, setWrittenPayload] = useState<string | null>(null);

  // Pulsing ring animation shown while in "writing" state
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.7);

  const pulseScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // Check NFC availability on mount
  useEffect(() => {
    let cancelled = false;
    checkNfcAvailability().then((result) => {
      if (!cancelled) {
        setNfcAvailability(result);
        setWriteState(result.available ? "idle" : "unavailable");
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Start/stop pulse animation based on writeState
  useEffect(() => {
    if (writeState === "writing") {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.32, { duration: 700 }),
          withTiming(1, { duration: 700 })
        ),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.15, { duration: 700 }),
          withTiming(0.7, { duration: 700 })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      pulseScale.value = withSpring(1, { damping: 12, stiffness: 200 });
      pulseOpacity.value = withTiming(0.7, { duration: 200 });
    }
  }, [writeState, pulseScale, pulseOpacity]);

  const handleWriteTag = useCallback(async () => {
    if (!localId) return;
    setWriteState("writing");
    setErrorMsg(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const payload = await writeTag(localId);
      setWrittenPayload(payload);
      setWriteState("success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setWriteState("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [localId]);

  const handleRetry = useCallback(() => {
    setWriteState("idle");
    setErrorMsg(null);
  }, []);

  const handleWriteAnother = useCallback(() => {
    setWriteState("idle");
    setWrittenPayload(null);
    setErrorMsg(null);
  }, []);

  const s = makeStyles(colors, isDark);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0) + 16;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[s.root, { paddingBottom: bottomPad }]}>
      <Stack.Screen
        options={{
          title: t("nfc_write.title"),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      {/* ── Checking NFC ─────────────────────────────────────────────────── */}
      {writeState === "checking_nfc" && (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[s.statusText, { color: colors.textSecondary, marginTop: 16 }]}>
            {t("nfc_write.checking_nfc")}
          </Text>
        </View>
      )}

      {/* ── NFC Unavailable ───────────────────────────────────────────────── */}
      {writeState === "unavailable" && nfcAvailability && !nfcAvailability.available && (
        <View style={s.centered}>
          <View style={[s.iconCircle, { backgroundColor: `${colors.warning}18` }]}>
            <Ionicons name="radio-outline" size={44} color={colors.warning} />
          </View>
          <Text style={[s.heading, { color: colors.text }]}>
            {t("nfc_write.unavailable_title")}
          </Text>
          <Text style={[s.statusText, { color: colors.textSecondary }]}>
            {nfcAvailability.message}
          </Text>
          <Pressable
            style={({ pressed }) => [s.btn, { backgroundColor: colors.surfaceElevated }, pressed && { opacity: 0.75 }]}
            onPress={() => router.back()}
          >
            <Text style={[s.btnText, { color: colors.text }]}>{t("common.back")}</Text>
          </Pressable>
        </View>
      )}

      {/* ── Idle: ready to write ──────────────────────────────────────────── */}
      {writeState === "idle" && (
        <View style={s.centered}>
          <View style={[s.iconCircle, { backgroundColor: `${colors.accent}18` }]}>
            <Ionicons name="radio-outline" size={44} color={colors.accent} />
          </View>
          <Text style={[s.heading, { color: colors.text }]}>
            {t("nfc_write.idle_title")}
          </Text>
          <Text style={[s.statusText, { color: colors.textSecondary }]}>
            {t("nfc_write.idle_subtitle")}
          </Text>
          <Text style={[s.payloadPreview, { color: colors.textTertiary, backgroundColor: colors.surfaceElevated }]}>
            {formatTagPayload(localId ?? "")}
          </Text>

          <Pressable
            style={({ pressed }) => [s.btn, { backgroundColor: colors.accent }, pressed && { opacity: 0.82 }]}
            onPress={handleWriteTag}
            testID="nfc-write-btn"
          >
            <Ionicons name="radio" size={20} color="#fff" />
            <Text style={[s.btnText, { color: "#fff" }]}>{t("nfc_write.write_btn")}</Text>
          </Pressable>
        </View>
      )}

      {/* ── Writing: scanning for tag ─────────────────────────────────────── */}
      {writeState === "writing" && (
        <View style={s.centered}>
          <View style={s.pulseWrap}>
            <Animated.View
              style={[
                s.pulseRing,
                pulseScaleStyle,
                { borderColor: colors.accent },
              ]}
            />
            <View style={[s.iconCircle, { backgroundColor: `${colors.accent}22` }]}>
              <Ionicons name="radio" size={44} color={colors.accent} />
            </View>
          </View>
          <Text style={[s.heading, { color: colors.text, marginTop: 32 }]}>
            {t("nfc_write.writing_title")}
          </Text>
          <Text style={[s.statusText, { color: colors.textSecondary }]}>
            {t("nfc_write.writing_subtitle")}
          </Text>
        </View>
      )}

      {/* ── Success ───────────────────────────────────────────────────────── */}
      {writeState === "success" && (
        <View style={s.centered}>
          <View style={[s.iconCircle, { backgroundColor: `${colors.success}18` }]}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
          </View>
          <Text style={[s.heading, { color: colors.text }]}>
            {t("nfc_write.success_title")}
          </Text>
          <Text style={[s.statusText, { color: colors.textSecondary }]}>
            {t("nfc_write.success_subtitle")}
          </Text>
          {writtenPayload && (
            <Text style={[s.payloadPreview, { color: colors.textTertiary, backgroundColor: colors.surfaceElevated }]}>
              {writtenPayload}
            </Text>
          )}

          <Pressable
            style={({ pressed }) => [s.btn, { backgroundColor: `${colors.accent}18`, borderColor: `${colors.accent}40`, borderWidth: 1 }, pressed && { opacity: 0.78 }]}
            onPress={handleWriteAnother}
          >
            <Ionicons name="radio" size={18} color={colors.accent} />
            <Text style={[s.btnText, { color: colors.accent }]}>{t("nfc_write.write_another")}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.btn, s.btnSecondary, { backgroundColor: colors.surfaceElevated }, pressed && { opacity: 0.75 }]}
            onPress={() => router.back()}
          >
            <Text style={[s.btnText, { color: colors.text }]}>{t("nfc_write.done")}</Text>
          </Pressable>
        </View>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {writeState === "error" && (
        <View style={s.centered}>
          <View style={[s.iconCircle, { backgroundColor: `${colors.error}18` }]}>
            <Ionicons name="close-circle" size={48} color={colors.error} />
          </View>
          <Text style={[s.heading, { color: colors.text }]}>
            {t("nfc_write.error_title")}
          </Text>
          {errorMsg && (
            <Text style={[s.statusText, { color: colors.textSecondary }]} numberOfLines={4}>
              {errorMsg}
            </Text>
          )}

          <Pressable
            style={({ pressed }) => [s.btn, { backgroundColor: colors.accent }, pressed && { opacity: 0.82 }]}
            onPress={handleRetry}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={[s.btnText, { color: "#fff" }]}>{t("nfc_write.retry")}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.btn, s.btnSecondary, { backgroundColor: colors.surfaceElevated }, pressed && { opacity: 0.75 }]}
            onPress={() => router.back()}
          >
            <Text style={[s.btnText, { color: colors.text }]}>{t("common.cancel")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function makeStyles(colors: typeof import("@/constants/colors").default.dark, isDark: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      gap: 12,
    },
    iconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    pulseWrap: {
      width: 96,
      height: 96,
      alignItems: "center",
      justifyContent: "center",
    },
    pulseRing: {
      position: "absolute",
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 2.5,
    },
    heading: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      textAlign: "center",
      marginBottom: 4,
    },
    statusText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 20,
      maxWidth: 280,
    },
    payloadPreview: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      marginTop: 4,
      letterSpacing: 0.2,
    },
    btn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 13,
      paddingHorizontal: 28,
      borderRadius: 12,
      minWidth: 220,
      marginTop: 8,
    },
    btnSecondary: {
      marginTop: 4,
    },
    btnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
  });
}
