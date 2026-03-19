/**
 * PrimaryButton – FilaBro UI System
 *
 * Haupt-CTA-Button (gefüllt, accent-Farbe).
 * Intern nutzt er PressableScale für konsistente Spring-Animation.
 */

import React, { ReactNode } from "react";
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native";
import { PressableScale } from "@/components/ui/PressableScale";
import { useAppTheme } from "@/contexts/AppContext";
import { spacing, radius, typography } from "@/constants/ui";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Optionales Icon links des Labels */
  icon?: ReactNode;
  style?: ViewStyle;
  labelStyle?: TextStyle;
  testID?: string;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  style,
  labelStyle,
  testID,
}: PrimaryButtonProps) {
  const { colors } = useAppTheme();

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      testID={testID}
      style={[
        styles.btn,
        { backgroundColor: colors.accent },
        ...(disabled || loading ? [styles.disabled] : []),
        ...(style ? [style] : []),
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, labelStyle]}>{label}</Text>
        </>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical:   spacing.md,
    borderRadius:      radius.md,
    minHeight:         48,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...(typography.bodyLg as TextStyle),
    color:      "#fff",
    flexShrink: 1,
  },
});
