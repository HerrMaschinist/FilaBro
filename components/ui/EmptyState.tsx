/**
 * EmptyState – FilaBro UI System
 *
 * Universeller Leer-/Fehler-/Lade-Zustand.
 * Ersetzt die dreifach redundante Variante in index.tsx
 * und die Kamera-Permission-Seite im scanner.tsx.
 */

import React, { ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/contexts/AppContext";
import { spacing, typography } from "@/constants/ui";

interface EmptyStateProps {
  /** Ionicons-Icon-Name ODER eigene Icon-Komponente als ReactNode */
  icon?: keyof typeof Ionicons.glyphMap | ReactNode;
  title: string;
  body?: string;
  /** Optionaler Aktions-Slot: z.B. ein PrimaryButton */
  action?: ReactNode;
  /** Ladeindikator anzeigen (überschreibt icon) */
  loading?: boolean;
  style?: ViewStyle;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  loading = false,
  style,
}: EmptyStateProps) {
  const { colors } = useAppTheme();

  const iconElement = (() => {
    if (loading) {
      return <ActivityIndicator size="large" color={colors.accent} />;
    }
    if (icon == null) return null;
    if (typeof icon === "string") {
      return (
        <Ionicons
          name={icon as keyof typeof Ionicons.glyphMap}
          size={56}
          color={colors.textTertiary}
        />
      );
    }
    return icon as ReactNode;
  })();

  return (
    <View style={[styles.root, style]}>
      {iconElement}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {body != null && (
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {body}
        </Text>
      )}
      {action != null && <View style={styles.actionSlot}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
    gap:            spacing.md,
    paddingHorizontal: spacing.xxl,
    paddingVertical:   spacing.xxl,
  },
  title: {
    ...(typography.heading as object),
    textAlign: "center",
  },
  body: {
    ...(typography.bodySm as object),
    textAlign: "center",
    marginTop: -spacing.xs,
  },
  actionSlot: {
    marginTop: spacing.sm,
    width:     "100%",
  },
});
