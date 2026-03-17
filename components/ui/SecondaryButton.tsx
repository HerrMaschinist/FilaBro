/**
 * SecondaryButton – FilaBro UI System
 *
 * Sekundärer Button (transparent, umranden oder nur Text).
 * Typischer Einsatz: Sheet-Aktionen, Abbrechen, Hilfs-Aktionen.
 */

import React, { ReactNode } from "react";
import {
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from "react-native";
import { PressableScale } from "@/components/ui/PressableScale";
import { useAppTheme } from "@/contexts/AppContext";
import { spacing, radius, typography } from "@/constants/ui";

interface SecondaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Optionales Icon links des Labels */
  icon?: ReactNode;
  /** Variante: 'outline' zeigt Rand, 'ghost' nur Text/Icon */
  variant?: "outline" | "ghost";
  style?: ViewStyle;
  labelStyle?: TextStyle;
  testID?: string;
}

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  icon,
  variant = "outline",
  style,
  labelStyle,
  testID,
}: SecondaryButtonProps) {
  const { colors } = useAppTheme();

  const borderWidth = variant === "outline" ? StyleSheet.hairlineWidth * 2 : 0;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={[
        styles.btn,
        {
          borderColor: colors.surfaceBorder,
          borderWidth,
        },
        ...(disabled ? [styles.disabled] : []),
        ...(style ? [style] : []),
      ]}
    >
      {icon}
      <Text
        style={[
          styles.label,
          { color: colors.textSecondary },
          labelStyle,
        ]}
      >
        {label}
      </Text>
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
    backgroundColor:   "transparent",
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    ...(typography.bodyLg as TextStyle),
    flexShrink: 1,
  },
});
