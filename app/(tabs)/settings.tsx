import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useApp } from "@/contexts/AppContext";
import { healthCheck } from "@/src/data/api/SpoolmanClient";

type TestState = "idle" | "testing" | "ok" | "error";

function formatTimestamp(ts: number | null): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const {
    serverUrl,
    setServerUrl,
    theme,
    setTheme,
    defaultWeightMode,
    setDefaultWeightMode,
    refreshSpools,
    lastSync,
    isSpoolsLoading,
    pendingUpdates,
    syncPending,
  } = useApp();

  const [urlInput, setUrlInput] = useState(serverUrl);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [serverVersion, setServerVersion] = useState<string | null>(null);

  const s = makeStyles(colors);
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  const testConnection = useCallback(async () => {
    if (!urlInput.trim()) return;
    setTestState("testing");
    setTestMessage("");
    setServerVersion(null);
    try {
      const health = await healthCheck(urlInput.trim());
      setTestState("ok");
      setServerVersion(health.version ?? null);
      setTestMessage(`Connected — status: ${health.status}`);
    } catch (err: unknown) {
      setTestState("error");
      setTestMessage(err instanceof Error ? err.message : "Connection failed");
    }
  }, [urlInput]);

  const saveUrl = useCallback(async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    await setServerUrl(trimmed);
    setTestState("idle");
    setTestMessage("");
    Alert.alert("Saved", "Server URL updated. Pull to refresh spools.");
  }, [urlInput, setServerUrl]);

  const syncNow = useCallback(async () => {
    await refreshSpools();
  }, [refreshSpools]);

  const THEME_OPTIONS = [
    { key: "auto", label: "System" },
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
  ];

  const WEIGHT_OPTIONS = [
    { key: "slider", label: "Slider" },
    { key: "numpad", label: "Numpad" },
  ];

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[s.content, { paddingTop: topInset }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[s.pageTitle, { color: colors.text }]}>Settings</Text>

      {/* ── Server ── */}
      <Text style={[s.sectionHeader, { color: colors.textSecondary }]}>
        SPOOLMAN SERVER
      </Text>
      <View style={[s.card, { backgroundColor: colors.surface }]}>
        <Text style={[s.label, { color: colors.textSecondary }]}>
          Server URL
        </Text>
        <TextInput
          style={[
            s.input,
            {
              backgroundColor: colors.background,
              color: colors.text,
              borderColor: colors.surfaceBorder,
            },
          ]}
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder="http://192.168.1.x:7912"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        {testMessage !== "" && (
          <Text
            style={[
              s.testMsg,
              { color: testState === "ok" ? colors.success : colors.error },
            ]}
          >
            {testMessage}
            {serverVersion ? `  (v${serverVersion})` : ""}
          </Text>
        )}

        <View style={s.btnRow}>
          <Pressable
            style={[
              s.btn,
              s.btnOutline,
              { borderColor: colors.accent },
              testState === "testing" && s.btnDisabled,
            ]}
            onPress={testConnection}
            disabled={testState === "testing"}
          >
            {testState === "testing" ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={[s.btnLabel, { color: colors.accent }]}>
                Test Connection
              </Text>
            )}
          </Pressable>

          <Pressable
            style={[s.btn, s.btnFill, { backgroundColor: colors.accent }]}
            onPress={saveUrl}
          >
            <Text style={[s.btnLabel, { color: "#fff" }]}>Save</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Sync ── */}
      <Text style={[s.sectionHeader, { color: colors.textSecondary }]}>
        SYNCHRONIZATION
      </Text>
      <View style={[s.card, { backgroundColor: colors.surface }]}>
        <View style={s.row}>
          <Ionicons
            name="time-outline"
            size={16}
            color={colors.textSecondary}
          />
          <Text style={[s.metaText, { color: colors.textSecondary }]}>
            Last sync: {formatTimestamp(lastSync)}
          </Text>
        </View>

        {pendingUpdates.length > 0 && (
          <View style={[s.row, { marginTop: 6 }]}>
            <Ionicons
              name="cloud-upload-outline"
              size={16}
              color={colors.warning ?? colors.accent}
            />
            <Text style={[s.metaText, { color: colors.warning ?? colors.accent }]}>
              {pendingUpdates.length} pending update
              {pendingUpdates.length !== 1 ? "s" : ""}
            </Text>
          </View>
        )}

        <View style={s.btnRow}>
          <Pressable
            style={[
              s.btn,
              s.btnFill,
              { backgroundColor: colors.accent },
              isSpoolsLoading && s.btnDisabled,
            ]}
            onPress={syncNow}
            disabled={isSpoolsLoading}
          >
            {isSpoolsLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[s.btnLabel, { color: "#fff" }]}>Sync Now</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* ── Appearance ── */}
      <Text style={[s.sectionHeader, { color: colors.textSecondary }]}>
        APPEARANCE
      </Text>
      <View style={[s.card, { backgroundColor: colors.surface }]}>
        <Text style={[s.label, { color: colors.textSecondary }]}>Theme</Text>
        <View style={s.segmented}>
          {THEME_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={[
                s.segment,
                { borderColor: colors.surfaceBorder },
                theme === opt.key && {
                  backgroundColor: colors.accent,
                  borderColor: colors.accent,
                },
              ]}
              onPress={() => setTheme(opt.key)}
            >
              <Text
                style={[
                  s.segmentLabel,
                  { color: theme === opt.key ? "#fff" : colors.text },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Weight Input ── */}
      <Text style={[s.sectionHeader, { color: colors.textSecondary }]}>
        WEIGHT INPUT
      </Text>
      <View style={[s.card, { backgroundColor: colors.surface }]}>
        <Text style={[s.label, { color: colors.textSecondary }]}>
          Default input mode
        </Text>
        <View style={s.segmented}>
          {WEIGHT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={[
                s.segment,
                { borderColor: colors.surfaceBorder },
                defaultWeightMode === opt.key && {
                  backgroundColor: colors.accent,
                  borderColor: colors.accent,
                },
              ]}
              onPress={() => setDefaultWeightMode(opt.key)}
            >
              <Text
                style={[
                  s.segmentLabel,
                  { color: defaultWeightMode === opt.key ? "#fff" : colors.text },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View
        style={{
          height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 100,
        }}
      />
    </ScrollView>
  );
}

function makeStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    pageTitle: {
      fontSize: 32,
      fontFamily: "Inter_700Bold",
      letterSpacing: -1,
      marginBottom: 28,
      paddingTop: 16,
    },
    sectionHeader: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 1,
      marginBottom: 8,
      marginTop: 24,
    },
    card: {
      borderRadius: 14,
      padding: 16,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      marginBottom: 8,
    },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
    },
    testMsg: {
      marginTop: 8,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
    },
    btnRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
    },
    btn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    btnOutline: {
      borderWidth: 1.5,
    },
    btnFill: {},
    btnDisabled: { opacity: 0.5 },
    btnLabel: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    metaText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
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
      fontSize: 14,
      fontFamily: "Inter_500Medium",
    },
  });
}
