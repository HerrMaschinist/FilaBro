import React, { ReactNode } from "react";
import { View, StyleSheet, ViewStyle, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { useAppTheme } from "@/contexts/AppContext";

interface GlassCardProps {
  children: ReactNode;
  style?: ViewStyle;
  intensity?: number;
  borderRadius?: number;
}

export function GlassCard({
  children,
  style,
  intensity = 40,
  borderRadius = 20,
}: GlassCardProps) {
  const { colors, isDark } = useAppTheme();

  const containerStyle: ViewStyle = {
    borderRadius,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    ...style,
  };

  if (Platform.OS === "web") {
    return (
      <View
        style={[
          containerStyle,
          {
            backgroundColor: isDark
              ? "rgba(17,24,39,0.75)"
              : "rgba(255,255,255,0.7)",
            backdropFilter: `blur(${intensity}px)`,
          } as ViewStyle,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <BlurView
        intensity={intensity}
        tint={isDark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark
              ? "rgba(17,24,39,0.55)"
              : "rgba(255,255,255,0.45)",
          },
        ]}
      />
      {children}
    </View>
  );
}
