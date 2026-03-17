import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import { fontSize, fontWeight } from "@/constants/ui";
import {
  checkNfcAvailability,
  type NfcAvailability,
} from "@/src/features/nfc";

type TestState = "idle" | "testing" | "ok" | "error";

// ─── Inline health check — no SpoolmanClient dependency ──────────────────────
async function healthCheck(baseUrl: string): Promise<{ version?: string }> {
  const url = baseUrl.trim().replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${url}/api/v1/health`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { version?: string };
  } finally {
    clearTimeout(timer);
  }
}

function formatTimestamp(ts: number | null, never: string): string {
  if (!ts) return never;
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const {
    serverUrl,
    setServerUrl,
    disconnectServer,
    connectionStatus,
    theme,
    setTheme,
    defaultWeightMode,
    setDefaultWeightMode,
    refreshSpools,
    lastSync,
    isSpoolsLoading,
    pendingUpdates,
    syncPending,
    language,
    setLanguage,
  } = useApp();

  const [urlInput, setUrlInput] = useState(serverUrl);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [nfcInfo, setNfcInfo] = useState<NfcAvailability | null>(null);

  useEffect(() => {
    checkNfcAvailability().then(setNfcInfo);
  }, []);

  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  const testConnection = useCallback(async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setTestState("testing");
    setTestMessage("");
    setServerVersion(null);
    try {
      const health = await healthCheck(trimmed);
      setTestState("ok");
      setServerVersion(health.version ?? null);
      setTestMessage(t("settings.status_connected"));
    } catch (err: unknown) {
      setTestState("error");
      setTestMessage(err instanceof Error ? err.message : t("settings.status_error"));
    }
  }, [urlInput, t]);

  const saveUrl = useCallback(async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    await setServerUrl(trimmed);
    setTestState("idle");
    setTestMessage("");
    Alert.alert(t("common.ok"), t("settings.server_saved"));
  }, [urlInput, setServerUrl, t]);

  const handleDisconnect = useCallback(async () => {
    Alert.alert(
      t("settings.disconnect"),
      t("settings.server_disconnected"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.disconnect"),
          style: "destructive",
          onPress: async () => {
            await disconnectServer();
            setUrlInput("");
            setTestState("idle");
            setTestMessage("");
          },
        },
      ]
    );
  }, [disconnectServer, t]);

  const syncNow = useCallback(async () => {
    if (!serverUrl) {
      Alert.alert(t("common.error"), t("settings.no_server_sync"));
      return;
    }
    await refreshSpools();
  }, [refreshSpools, serverUrl, t]);

  const statusDot = {
    connected: colors.success,
    offline: colors.warning,
    no_server: colors.textTertiary,
    error: colors.error,
  }[connectionStatus];

  const statusLabel = {
    connected: t("settings.status_connected"),
    offline: t("settings.status_offline"),
    no_server: t("settings.status_no_server"),
    error: t("settings.status_error"),
  }[connectionStatus];

  const THEME_OPTIONS = [
    { key: "auto", label: t("settings.theme_auto") },
    { key: "light", label: t("settings.theme_light") },
    { key: "dark", label: t("settings.theme_dark") },
  ];

  const WEIGHT_OPTIONS = [
    { key: "slider", label: t("settings.weight_slider") },
    { key: "numpad", label: t("settings.weight_numpad") },
  ];

  const LANG_OPTIONS = [
    { key: "en", label: t("settings.lang_en") },
    { key: "de", label: t("settings.lang_de") },
  ];

  const s = makeStyles(colors);

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[s.content, { paddingTop: topInset }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[s.pageTitle, { color: colors.text }]}>{t("settings.title")}</Text>

      {/* ── Connection ── */}
      <Text style={s.sectionHeader}>
        {t("settings.connection")}
      </Text>
      <View style={[s.card, { backgroundColor: colors.surface }]}>
        <View style={s.statusRow}>
          <View style={[s.statusDot, { backgroundColor: statusDot }]} />
          <Text style={[s.statusLabel, { color: colors.textSecondary }]}>{statusLabel}</Text>
        </View>

        <Text style={[s.label, { color: colors.textSecondary }]}>{t("settings.server_url")}</Text>
        <TextInput
          style={[s.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.surfaceBorder }]}
          value={urlInput}
          onChangeText={(v) => { setUrlInput(v); setTestState("idle"); setTestMessage(""); }}
          placeholder="http://192.168.1.x:7912"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        {testMessage !== "" && (
          <Text style={[s.testMsg, { color: testState === "ok" ? colors.success : colors.error }]}>
            {testMessage}{serverVersion ? `  (v${serverVersion})` : ""}
          </Text>
        )}

        <View style={s.btnRow}>
          <Pressable
            style={[s.btn, s.btnOutline, { borderColor: colors.accent }, testState === "testing" && s.btnDisabled]}
            onPress={testConnection}
            disabled={testState === "testing"}
          >
            {testState === "testing" ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={[s.btnLabel, { color: colors.accent }]}>{t("settings.test")}</Text>
            )}
          </Pressable>

          <Pressable
            style={[s.btn, s.btnFill, { backgroundColor: colors.accent }]}
            onPress={saveUrl}
          >
            <Text style={[s.btnLabel, { color: "#fff" }]}>{t("settings.save")}</Text>
          </Pressable>
        </View>

        {serverUrl ? (
          <Pressable style={s.disconnectBtn} onPress={handleDisconnect}>
            <Ionicons name="unlink-outline" size={15} color={colors.error} />
            <Text style={[s.disconnectLabel, { color: colors.error }]}>{t("settings.disconnect")}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Sync ── */}
      <Text style={s.sectionHeader}>{t("settings.sync")}</Text>
      <View style={[s.card, { backgroundColor: colors.surface }]}>
        <View style={s.row}>
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
          <Text style={[s.metaText, { color: colors.textSecondary }]}>
            {t("settings.last_sync")}: {formatTimestamp(lastSync, t("settings.never"))}
          </Text>
        </View>

        {pendingUpdates.length > 0 && (
          <View style={[s.row, { marginTop: 6 }]}>
            <Ionicons name="cloud-upload-outline" size={16} color={colors.warning} />
            <Text style={[s.metaText, { color: colors.warning }]}>
              {t("settings.pending", { count: pendingUpdates.length })}
            </Text>
          </View>
        )}

        <View style={s.btnRow}>
          <Pressable
            style={[s.btn, s.btnFill, { backgroundColor: colors.accent }, isSpoolsLoading && s.btnDisabled]}
            onPress={syncNow}
            disabled={isSpoolsLoading}
          >
            {isSpoolsLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[s.btnLabel, { color: "#fff" }]}>{t("settings.sync_now")}</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* ── Language ── */}
      <Text style={s.sectionHeader}>{t("settings.language")}</Text>
      <View style={[s.card, { backgroundColor: colors.surface }]}>
        <View style={s.segmented}>
          {LANG_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={[
                s.segment,
                { borderColor: colors.surfaceBorder },
                language === opt.key && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
              onPress={() => setLanguage(opt.key)}
            >
              <Text style={[s.segmentLabel, { color: language === opt.key ? "#fff" : colors.text }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Appearance ── */}
      <Text style={s.sectionHeader}>{t("settings.appearance")}</Text>
      <View style={[s.card, { backgroundColor: colors.surface }]}>
        <Text style={[s.label, { color: colors.textSecondary }]}>{t("settings.theme")}</Text>
        <View style={s.segmented}>
          {THEME_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={[
                s.segment,
                { borderColor: colors.surfaceBorder },
                theme === opt.key && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
              onPress={() => setTheme(opt.key)}
            >
              <Text style={[s.segmentLabel, { color: theme === opt.key ? "#fff" : colors.text }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Weight Input ── */}
      <Text style={s.sectionHeader}>{t("settings.weight_input")}</Text>
      <View style={[s.card, { backgroundColor: colors.surface }]}>
        <Text style={[s.label, { color: colors.textSecondary }]}>{t("settings.weight_mode")}</Text>
        <View style={s.segmented}>
          {WEIGHT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={[
                s.segment,
                { borderColor: colors.surfaceBorder },
                defaultWeightMode === opt.key && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
              onPress={() => setDefaultWeightMode(opt.key)}
            >
              <Text style={[s.segmentLabel, { color: defaultWeightMode === opt.key ? "#fff" : colors.text }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Debug ── */}
      <Text style={s.sectionHeader}>{t("settings.debug")}</Text>
      <View style={[s.card, { backgroundColor: colors.surface }]}>
        {/* Persistence */}
        <View style={s.debugRow}>
          <Ionicons
            name="server-outline"
            size={15}
            color={Platform.OS !== "web" ? colors.success : colors.textTertiary}
          />
          <Text style={[s.debugKey, { color: colors.textSecondary }]}>
            {t("settings.debug_persistence")}
          </Text>
          <Text
            style={[
              s.debugValue,
              { color: Platform.OS !== "web" ? colors.success : colors.textTertiary },
            ]}
          >
            {Platform.OS !== "web"
              ? t("settings.debug_persistence_on")
              : t("settings.debug_persistence_off")}
          </Text>
        </View>

        <View style={[s.divider, { backgroundColor: colors.surfaceBorder }]} />

        {/* NFC */}
        <View style={s.debugRow}>
          <Ionicons
            name="radio-outline"
            size={15}
            color={nfcInfo?.available ? colors.success : colors.textTertiary}
          />
          <Text style={[s.debugKey, { color: colors.textSecondary }]}>
            {t("settings.debug_nfc")}
          </Text>
          <Text
            style={[
              s.debugValue,
              { color: nfcInfo?.available ? colors.success : colors.textTertiary },
            ]}
          >
            {nfcInfo === null
              ? "…"
              : nfcInfo.available
              ? t("settings.debug_nfc_available")
              : t("settings.debug_nfc_unavailable")}
          </Text>
        </View>
        {nfcInfo && !nfcInfo.available && (
          <Text style={[s.debugHint, { color: colors.textTertiary }]}>
            {t("settings.debug_nfc_reason", { reason: nfcInfo.reason })}
          </Text>
        )}

        <View style={[s.divider, { backgroundColor: colors.surfaceBorder }]} />

        {/* App version */}
        <View style={s.debugRow}>
          <Ionicons name="information-circle-outline" size={15} color={colors.textTertiary} />
          <Text style={[s.debugKey, { color: colors.textSecondary }]}>
            {t("settings.debug_version")}
          </Text>
          <Text style={[s.debugValue, { color: colors.textTertiary }]}>
            {Constants.expoConfig?.version ?? ""}
          </Text>
        </View>
      </View>

      <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 100 }} />
    </ScrollView>
  );
}

function makeStyles(colors: typeof import("@/constants/colors").default.dark) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    pageTitle: {
      fontSize: fontSize.h1,
      fontFamily: fontWeight.bold,
      letterSpacing: -1,
      marginBottom: 28,
      paddingTop: 16,
    },
    sectionHeader: {
      fontSize: fontSize.xs,
      fontFamily: fontWeight.semibold,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.textTertiary,
      marginBottom: 8,
      marginTop: 24,
    },
    card: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      padding: 16,
      gap: 10,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 4,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusLabel: {
      fontSize: fontSize.base,
      fontFamily: fontWeight.medium,
    },
    label: {
      fontSize: fontSize.base,
      fontFamily: fontWeight.medium,
    },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: fontSize.lg,
      fontFamily: fontWeight.regular,
    },
    testMsg: {
      fontSize: fontSize.base,
      fontFamily: fontWeight.regular,
    },
    btnRow: {
      flexDirection: "row",
      gap: 10,
    },
    btn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    btnOutline: { borderWidth: 1.5 },
    btnFill: {},
    btnDisabled: { opacity: 0.5 },
    btnLabel: {
      fontSize: fontSize.md,
      fontFamily: fontWeight.semibold,
    },
    disconnectBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 8,
    },
    disconnectLabel: {
      fontSize: fontSize.base,
      fontFamily: fontWeight.medium,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    metaText: {
      fontSize: fontSize.base,
      fontFamily: fontWeight.regular,
    },
    segmented: {
      flexDirection: "row",
      gap: 8,
    },
    segment: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 8,
      paddingVertical: 8,
      alignItems: "center",
    },
    segmentLabel: {
      fontSize: fontSize.md,
      fontFamily: fontWeight.medium,
    },
    debugRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    debugKey: {
      flex: 1,
      fontSize: fontSize.base,
      fontFamily: fontWeight.regular,
    },
    debugValue: {
      fontSize: fontSize.base,
      fontFamily: fontWeight.medium,
    },
    debugHint: {
      fontSize: fontSize.xs,
      fontFamily: fontWeight.regular,
      marginLeft: 23,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginVertical: 2,
    },
  });
}
