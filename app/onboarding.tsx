import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import { FilaBaseAdapter } from "@/src/adapters/filabase";
import type { FilaBaseNetworkError } from "@/src/data/api/FilaBaseClient";

const DEFAULT_URL = "http://192.168.XX.XX:7912";

type CheckStatus = "idle" | "checking" | "ok" | "error";

interface DiagInfo {
  endpoint: string;
  errorType: string;
  errorMsg: string;
}

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { setServerUrl, markOnboarded } = useApp();

  const [url, setUrl] = useState(DEFAULT_URL);
  const [status, setStatus] = useState<CheckStatus>("idle");
  const [serverVersion, setServerVersion] = useState("");
  const [diag, setDiag] = useState<DiagInfo | null>(null);

  const normalizeInput = (raw: string) => {
    let u = raw.trim().replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "");
    return u.replace(/\/+$/, "");
  };

  const handleCheck = async () => {
    const trimmed = normalizeInput(url);
    if (!trimmed) return;
    setUrl(trimmed);
    setStatus("checking");
    setDiag(null);
    setServerVersion("");

    try {
      const health = (await FilaBaseAdapter.healthCheck(trimmed)) as {
        status: string;
        version?: string;
      };
      setStatus("ok");
      setServerVersion(health.version ?? "");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      setStatus("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      const netErr = err as Partial<FilaBaseNetworkError>;
      if (netErr.errorType) {
        setDiag({
          endpoint: netErr.endpoint ?? trimmed,
          errorType: netErr.errorType,
          errorMsg: netErr.message ?? String(err),
        });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setDiag({
          endpoint: `${trimmed}/api/v1/health`,
          errorType: "unknown",
          errorMsg: msg,
        });
      }
    }
  };

  const handleConnect = async () => {
    const trimmed = normalizeInput(url);
    if (!trimmed) return;
    await setServerUrl(trimmed);
    await markOnboarded();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)");
  };

  const handleSkip = async () => {
    await markOnboarded();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/(tabs)");
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0) + 32;

  const errorTypeLabel: Record<string, string> = {
    timeout: t("onboarding.error_type.timeout"),
    network: t("onboarding.error_type.network"),
    cleartext: t("onboarding.error_type.cleartext"),
    http_error: t("onboarding.error_type.http_error"),
    parse_error: t("onboarding.error_type.parse_error"),
    unknown: t("onboarding.error_type.unknown"),
  };

  const s = makeStyles(colors);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[s.container, { paddingTop: topPad, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <View style={[s.iconWrap, { backgroundColor: `${colors.accent}18` }]}>
            <Ionicons name="layers" size={44} color={colors.accent} />
          </View>
          <Text style={[s.title, { color: colors.text }]}>{t("onboarding.title")}</Text>
          <Text style={[s.subtitle, { color: colors.textSecondary }]}>
            {t("onboarding.subtitle")}
          </Text>
        </View>

        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
            {t("onboarding.server_url_label")}
          </Text>
          <TextInput
            style={[s.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.surfaceBorder }]}
            value={url}
            onChangeText={(t) => { setUrl(t); setStatus("idle"); setDiag(null); }}
            placeholder={DEFAULT_URL}
            placeholderTextColor={colors.textTertiary}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleCheck}
          />
          <Text style={[s.hint, { color: colors.textTertiary }]}>
            {t("onboarding.http_hint")}
          </Text>
        </View>

        {status === "ok" && (
          <View style={[s.banner, { backgroundColor: `${colors.success}15`, borderColor: `${colors.success}40` }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={[s.bannerText, { color: colors.success }]}>
              {t("onboarding.connected")}
              {serverVersion ? ` · ${t("onboarding.server_version", { version: serverVersion })}` : ""}
            </Text>
          </View>
        )}

        {status === "error" && diag && (
          <View style={[s.diagCard, { backgroundColor: `${colors.error}10`, borderColor: `${colors.error}30` }]}>
            <View style={s.diagRow}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={[s.diagType, { color: colors.error }]}>
                {errorTypeLabel[diag.errorType] ?? diag.errorType}
              </Text>
            </View>
            <Text style={[s.diagMsg, { color: colors.text }]} numberOfLines={4}>
              {diag.errorMsg}
            </Text>
            <View style={[s.diagEndpointRow, { backgroundColor: `${colors.error}10` }]}>
              <Text style={[s.diagEndpointLabel, { color: colors.textTertiary }]}>
                {t("onboarding.endpoint_label")}
              </Text>
              <Text style={[s.diagEndpoint, { color: colors.textSecondary }]} numberOfLines={1}>
                {diag.endpoint}
              </Text>
            </View>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [s.btn, s.btnOutline, { borderColor: colors.accent }, pressed && { opacity: 0.75 }]}
          onPress={handleCheck}
          disabled={status === "checking"}
        >
          {status === "checking" ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <>
              <Ionicons name="wifi" size={18} color={colors.accent} />
              <Text style={[s.btnOutlineText, { color: colors.accent }]}>
                {t("onboarding.test_connection")}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            s.btn,
            s.btnPrimary,
            { backgroundColor: status === "ok" ? colors.accent : colors.surfaceElevated },
            pressed && status === "ok" && { opacity: 0.85 },
          ]}
          onPress={handleConnect}
          disabled={status !== "ok"}
        >
          <Text style={[s.btnPrimaryText, { color: status === "ok" ? "#000" : colors.textTertiary }]}>
            {t("onboarding.connect")}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={18}
            color={status === "ok" ? "#000" : colors.textTertiary}
          />
        </Pressable>

        <View style={s.dividerRow}>
          <View style={[s.divider, { backgroundColor: colors.surfaceBorder }]} />
          <Text style={[s.dividerText, { color: colors.textTertiary }]}>or</Text>
          <View style={[s.divider, { backgroundColor: colors.surfaceBorder }]} />
        </View>

        <Pressable
          style={({ pressed }) => [s.btn, s.btnSkip, { borderColor: colors.surfaceBorder }, pressed && { opacity: 0.7 }]}
          onPress={handleSkip}
        >
          <Ionicons name="cloud-offline-outline" size={18} color={colors.textSecondary} />
          <Text style={[s.btnSkipText, { color: colors.textSecondary }]}>
            {t("onboarding.skip")}
          </Text>
        </Pressable>

        <Text style={[s.footNote, { color: colors.textTertiary }]}>
          {t("onboarding.skip_hint")}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: typeof import("@/constants/colors").default.dark) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      paddingHorizontal: 20,
      gap: 14,
    },
    header: {
      alignItems: "center",
      gap: 10,
      marginBottom: 8,
    },
    iconWrap: {
      width: 84,
      height: 84,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 38,
      fontFamily: "Inter_700Bold",
      letterSpacing: -1.5,
    },
    subtitle: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 22,
      paddingHorizontal: 20,
    },
    card: {
      borderRadius: 16,
      padding: 16,
      gap: 10,
      borderWidth: 1,
    },
    fieldLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 1,
    },
    input: {
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      borderWidth: 1,
    },
    hint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      lineHeight: 17,
    },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 12,
      padding: 12,
      gap: 8,
      borderWidth: 1,
    },
    bannerText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
    diagCard: {
      borderRadius: 14,
      padding: 14,
      gap: 10,
      borderWidth: 1,
    },
    diagRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    diagType: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
    },
    diagMsg: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      lineHeight: 19,
    },
    diagEndpointRow: {
      borderRadius: 8,
      padding: 10,
      gap: 2,
    },
    diagEndpointLabel: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
    },
    diagEndpoint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
    },
    btn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      paddingVertical: 15,
      gap: 8,
    },
    btnPrimary: {
      backgroundColor: colors.accent,
    },
    btnPrimaryText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
    },
    btnOutline: {
      borderWidth: 1.5,
      backgroundColor: "transparent",
    },
    btnOutlineText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
    },
    btnSkip: {
      borderWidth: 1,
      backgroundColor: "transparent",
    },
    btnSkipText: {
      fontSize: 16,
      fontFamily: "Inter_500Medium",
    },
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginVertical: 2,
    },
    divider: {
      flex: 1,
      height: 1,
    },
    dividerText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
    },
    footNote: {
      textAlign: "center",
      fontSize: 12,
      fontFamily: "Inter_400Regular",
    },
  });
}
