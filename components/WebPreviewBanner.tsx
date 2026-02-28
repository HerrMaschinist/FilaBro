import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

export function WebPreviewBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (Platform.OS !== "web") return null;

  return (
    <View style={[styles.banner, { top: insets.top }]}>
      <Text style={styles.text}>{t("common.web_preview_banner")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: "rgba(255, 152, 0, 0.92)",
    paddingVertical: 5,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  text: {
    color: "#000",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
});
