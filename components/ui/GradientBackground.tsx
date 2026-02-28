import React, { ReactNode } from "react";
import { StyleSheet, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "@/contexts/AppContext";

interface GradientBackgroundProps {
  children: ReactNode;
  style?: ViewStyle;
}

export function GradientBackground({
  children,
  style,
}: GradientBackgroundProps) {
  const { isDark } = useAppTheme();

  const gradientColors: [string, string, string] = isDark
    ? ["#0B0F1A", "#111827", "#0F172A"]
    : ["#F0F4FA", "#E8EDF5", "#F0F4FA"];

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
