import React from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/contexts/AppContext";
import { spacing, radius, fontSize, fontWeight } from "@/constants/ui";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: IoniconsName;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
}

export function EmptyState({
  title,
  message,
  icon,
  actionLabel,
  onAction,
  loading = false,
}: EmptyStateProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color={colors.accent} size="large" />
      ) : (
        icon !== undefined && (
          <Ionicons name={icon} size={48} color={colors.textTertiary} />
        )
      )}

      {!loading && (
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      )}

      <Text style={[styles.message, { color: colors.textSecondary }]}>
        {message}
      </Text>

      {!loading && actionLabel != null && onAction != null && (
        <Pressable
          style={[styles.button, { backgroundColor: colors.accent }]}
          onPress={onAction}
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xxxl,
    paddingTop: 60,
  },
  title: {
    fontSize: fontSize.h3,
    fontFamily: fontWeight.semibold,
    textAlign: "center",
  },
  message: {
    fontSize: fontSize.md,
    fontFamily: fontWeight.regular,
    textAlign: "center",
    lineHeight: 20,
  },
  button: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  buttonText: {
    color: "#fff",
    fontSize: fontSize.lg,
    fontFamily: fontWeight.semibold,
  },
});
