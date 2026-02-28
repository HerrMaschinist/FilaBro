import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useColorScheme,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/contexts/AppContext";

// expo-camera v17 for Expo SDK 54
import { CameraView, useCameraPermissions } from "expo-camera";

function extractSpoolId(data: string): number | null {
  // Match direct numeric ID
  if (/^\d+$/.test(data.trim())) return parseInt(data.trim(), 10);

  // Match URLs like http://host/spool/123 or /spool/123
  const urlMatch = data.match(/\/spool\/(\d+)/i);
  if (urlMatch) return parseInt(urlMatch[1], 10);

  // Match query param ?id=123
  const qMatch = data.match(/[?&]id=(\d+)/i);
  if (qMatch) return parseInt(qMatch[1], 10);

  return null;
}

export default function ScannerScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { spools } = useApp();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (scanned) return;
      setScanned(true);
      setLastResult(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const spoolId = extractSpoolId(data);

      if (spoolId !== null) {
        // Check local cache first
        const found = spools.find((s) => s.id === spoolId);
        if (found) {
          router.push({ pathname: "/spool/[id]", params: { id: String(spoolId) } });
        } else {
          Alert.alert(
            "Spool Found",
            `ID ${spoolId} – navigating to detail...`,
            [
              {
                text: "Open",
                onPress: () =>
                  router.push({ pathname: "/spool/[id]", params: { id: String(spoolId) } }),
              },
              { text: "Cancel", onPress: () => setScanned(false) },
            ]
          );
        }
      } else {
        // Search by content in local cache
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
            "Code Scanned",
            `Could not identify a spool from:\n"${data.slice(0, 80)}"`,
            [{ text: "Scan Again", onPress: () => setScanned(false) }]
          );
        }
      }
    },
    [scanned, spools]
  );

  const s = makeStyles(colors);

  if (!permission) {
    return (
      <View style={[s.container, { paddingTop: topPad }]}>
        <View style={s.centered}>
          <ActivityLoader color={colors.accent} />
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[s.container, { paddingTop: topPad }]}>
        <Text style={[s.header, { color: colors.text }]}>Scanner</Text>
        <View style={s.centered}>
          <Ionicons name="camera-outline" size={64} color={colors.textTertiary} />
          <Text style={[s.permTitle, { color: colors.text }]}>Camera Access Needed</Text>
          <Text style={[s.permText, { color: colors.textSecondary }]}>
            FilaBro needs camera access to scan barcodes and QR codes on your filament spools.
          </Text>
          {!permission.canAskAgain && Platform.OS !== "web" ? (
            <Text style={[s.permText, { color: colors.textSecondary, marginTop: 8 }]}>
              Please enable camera access in your device Settings.
            </Text>
          ) : (
            <Pressable
              style={[s.permBtn, { backgroundColor: colors.accent }]}
              onPress={requestPermission}
            >
              <Text style={s.permBtnText}>Allow Camera</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container]}>
      {/* Camera fills screen */}
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "datamatrix"] }}
        onBarcodeScanned={scanned ? undefined : handleBarcode}
      />

      {/* Overlay UI */}
      <View style={[s.overlay, { paddingTop: topPad + 8, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }]}>
        <Text style={s.overlayTitle}>Scanner</Text>

        <View style={s.viewfinder}>
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />
          <Text style={s.viewfinderHint}>Align barcode or QR code</Text>
        </View>

        {lastResult && scanned && (
          <View style={s.resultCard}>
            <Text style={s.resultLabel}>Last Scan</Text>
            <Text style={s.resultValue} numberOfLines={2}>{lastResult}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [s.resetBtn, pressed && { opacity: 0.8 }]}
          onPress={() => { setScanned(false); setLastResult(null); }}
        >
          <Ionicons name="refresh" size={20} color="#fff" />
          <Text style={s.resetBtnText}>Scan Again</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const style: Record<string, number | string> = {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#00D4AA",
    borderWidth: 3,
  };
  if (pos === "tl") { style.top = 0; style.left = 0; style.borderRightWidth = 0; style.borderBottomWidth = 0; style.borderTopLeftRadius = 4; }
  if (pos === "tr") { style.top = 0; style.right = 0; style.borderLeftWidth = 0; style.borderBottomWidth = 0; style.borderTopRightRadius = 4; }
  if (pos === "bl") { style.bottom = 0; style.left = 0; style.borderRightWidth = 0; style.borderTopWidth = 0; style.borderBottomLeftRadius = 4; }
  if (pos === "br") { style.bottom = 0; style.right = 0; style.borderLeftWidth = 0; style.borderTopWidth = 0; style.borderBottomRightRadius = 4; }
  return <View style={style as object} />;
}

function ActivityLoader({ color }: { color: string }) {
  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <Ionicons name="scan-outline" size={48} color={color} />
    </View>
  );
}

function makeStyles(colors: typeof Colors.dark) {
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
      paddingBottom: 12,
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
    viewfinder: {
      width: 240,
      height: 240,
      position: "relative",
      alignItems: "center",
      justifyContent: "flex-end",
      paddingBottom: 12,
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
      borderColor: "rgba(0,212,170,0.4)",
    },
    resultLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: "#00D4AA",
      letterSpacing: 0.8,
    },
    resultValue: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: "#fff",
    },
    resetBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(0,212,170,0.25)",
      borderRadius: 14,
      paddingHorizontal: 24,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: "#00D4AA",
    },
    resetBtnText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
  });
}
