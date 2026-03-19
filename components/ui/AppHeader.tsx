/**
 * AppHeader – FilaBro UI System
 *
 * Standardisierter Screen-Header.
 * Löst die ad-hoc View-Header in index.tsx und scanner.tsx ab.
 */

import React, { ReactNode } from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { useAppTheme } from "@/contexts/AppContext";
import { spacing, typography } from "@/constants/ui";

interface AppHeaderProps {
  title: string;
  /** Optionale Aktions-Elemente rechts (Icons, Badges, Buttons) */
  actions?: ReactNode;
  /** Optionaler Zusatz unter dem Titel (Sync-Label, Zähler etc.) */
  subtitle?: string;
  style?: ViewStyle;
}

export function AppHeader({ title, actions, subtitle, style }: AppHeaderProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.root, style]}>
      <View style={styles.titleRow}>
        <Text
          style={[styles.title, { color: colors.text }]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {actions != null && <View style={styles.actions}>{actions}</View>}
      </View>
      {subtitle != null && (
        <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    paddingBottom:     spacing.sm,
  },
  titleRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
  },
  title: {
    ...typography.title,
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           spacing.sm,
    marginLeft:    spacing.md,
  },
  subtitle: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
});
