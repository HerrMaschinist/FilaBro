import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/contexts/AppContext";
import {
  Spool,
  getFilamentColor,
  getRemainingPercent,
  getDisplayName,
} from "@/lib/spoolman";

interface SpoolCardProps {
  spool: Spool;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  isPending?: boolean;
}

export function SpoolCard({
  spool,
  isFavorite,
  onPress,
  onToggleFavorite,
  isPending = false,
}: SpoolCardProps) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  const filamentColor = getFilamentColor(spool);
  const percent = getRemainingPercent(spool);
  const name = getDisplayName(spool);
  const remaining = spool.remaining_weight ?? spool.initial_weight ?? 0;
  const total = spool.initial_weight ?? spool.filament?.weight ?? 1000;

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSpring(0.97, { damping: 15 }, () => {
      scale.value = withSpring(1);
    });
    onPress();
  };

  const handleFav = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleFavorite();
  };

  const percentColor =
    percent < 15
      ? colors.error
      : percent < 30
      ? colors.warning
      : colors.accent;

  return (
    <Animated.View style={animStyle}>
      <Pressable onPress={handlePress} style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <View style={[s.colorBar, { backgroundColor: filamentColor }]} />
          <View style={s.content}>
            <View style={s.topRow}>
              <View style={s.nameWrap}>
                <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>
                  {name}
                </Text>
                <View style={s.badges}>
                  <View style={[s.badge, { backgroundColor: `${colors.accent}1A` }]}>
                    <Text style={[s.badgeText, { color: colors.accent }]}>
                      {spool.filament?.material ?? "—"}
                    </Text>
                  </View>
                  {isPending && (
                    <View style={[s.badge, { backgroundColor: `${colors.warning}1A` }]}>
                      <Ionicons name="cloud-upload-outline" size={10} color={colors.warning} />
                      <Text style={[s.badgeText, { color: colors.warning }]}>{t("spool_card.pending")}</Text>
                    </View>
                  )}
                  {spool.archived && (
                    <View style={[s.badge, { backgroundColor: `${colors.textTertiary}1A` }]}>
                      <Text style={[s.badgeText, { color: colors.textTertiary }]}>{t("spool_card.archived")}</Text>
                    </View>
                  )}
                </View>
              </View>
              <Pressable onPress={handleFav} hitSlop={12} style={s.favBtn}>
                <Ionicons
                  name={isFavorite ? "heart" : "heart-outline"}
                  size={20}
                  color={isFavorite ? colors.error : colors.textTertiary}
                />
              </Pressable>
            </View>

            {spool.filament?.vendor?.name && (
              <Text style={[s.vendor, { color: colors.textSecondary }]} numberOfLines={1}>
                {spool.filament.vendor.name}
              </Text>
            )}

            <View style={s.weightRow}>
              <View style={s.progressWrap}>
                <View style={[s.progressTrack, { backgroundColor: colors.surfaceElevated }]}>
                  <View
                    style={[
                      s.progressFill,
                      {
                        width: `${percent}%` as `${number}%`,
                        backgroundColor: percentColor,
                      },
                    ]}
                  />
                </View>
              </View>
              <Text style={[s.weightText, { color: percentColor }]}>
                {Math.round(remaining)}
                <Text style={[s.weightUnit, { color: colors.textSecondary }]}>g</Text>
                <Text style={[s.weightTotal, { color: colors.textTertiary }]}>
                  {" "}/ {Math.round(total)}g
                </Text>
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginHorizontal: 16,
    marginVertical: 5,
  },
  colorBar: {
    width: 5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  nameWrap: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    gap: 3,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  favBtn: {
    padding: 4,
  },
  vendor: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: -2,
  },
  weightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  progressWrap: {
    flex: 1,
  },
  progressTrack: {
    height: 4,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  weightText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    minWidth: 80,
    textAlign: "right",
  },
  weightUnit: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  weightTotal: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
