import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/contexts/AppContext";
import { fontWeight } from "@/constants/ui";
import {
  Spool,
  getFilamentColor,
  getRemainingPercent,
  getDisplayName,
} from "@/lib/spoolViewTypes";

interface SpoolCardProps {
  spool: Spool;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  isPending?: boolean;
  index?: number;
}

export function SpoolCard({
  spool,
  isFavorite,
  onPress,
  onToggleFavorite,
  isPending = false,
  index = 0,
}: SpoolCardProps) {
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();

  const filamentColor = getFilamentColor(spool);
  const percent = getRemainingPercent(spool);
  const name = getDisplayName(spool);
  const remaining = spool.remaining_weight ?? spool.initial_weight ?? 0;
  const total = spool.initial_weight ?? spool.filament?.weight ?? 1000;

  const scale = useSharedValue(1);
  const lift = useSharedValue(0);

  const entryOpacity = useSharedValue(0);
  const entryY = useSharedValue(12);

  useEffect(() => {
    const delay = Math.min(index * 40, 280);
    entryOpacity.value = withDelay(delay, withTiming(1, { duration: 320 }));
    entryY.value = withDelay(delay, withSpring(0, { damping: 22, stiffness: 200 }));
  }, []);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: lift.value },
    ],
  }));

  const entryStyle = useAnimatedStyle(() => ({
    opacity: entryOpacity.value,
    transform: [{ translateY: entryY.value }],
  }));

  const handlePress = () => { onPress(); };

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

  const glassBg = isDark ? "rgba(17,24,39,0.65)" : "rgba(255,255,255,0.72)";
  const glassBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const lowGlow = percent < 20 ? {
    shadowColor:   percentColor,
    shadowOpacity: 0.32,
    shadowRadius:  14,
    shadowOffset:  { width: 0, height: 4 } as const,
    elevation:     percent < 15 ? 10 : 6,
  } : {};

  return (
    <Animated.View style={entryStyle}>
      <Animated.View style={pressStyle}>
        <Pressable
          onPress={handlePress}
          onPressIn={() => {
            scale.value = withSpring(1.015, { damping: 16, stiffness: 380 });
            lift.value  = withSpring(-2,    { damping: 16, stiffness: 380 });
          }}
          onPressOut={() => {
            scale.value = withSpring(1, { damping: 14, stiffness: 260 });
            lift.value  = withSpring(0, { damping: 14, stiffness: 260 });
          }}
        >
          <View
            style={[
              s.card,
              { borderColor: glassBorder },
              lowGlow,
              Platform.OS === "web" && {
                backgroundColor: glassBg,
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
              } as any,
            ]}
          >
            {Platform.OS !== "web" && (
              <BlurView
                intensity={isDark ? 55 : 40}
                tint={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            )}
            {Platform.OS !== "web" && (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: isDark
                      ? "rgba(17,24,39,0.55)"
                      : "rgba(255,255,255,0.60)",
                  },
                ]}
              />
            )}
            <LinearGradient
              colors={[filamentColor, filamentColor + "30"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={s.colorBar}
            />
            <View style={s.content}>
              <View style={s.topRow}>
                <View style={s.nameWrap}>
                  <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <View style={s.badges}>
                    <View style={[s.badge, { backgroundColor: `${colors.accent}1A` }]}>
                      <Text style={[s.badgeText, { color: colors.accent }]}>
                        {spool.filament?.material ?? "?"}
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
                  <View style={[s.progressTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]}>
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
                <View style={s.weightBlock}>
                  <Text style={[s.weightBig, { color: percentColor }]}>
                    {Math.round(remaining)}
                  </Text>
                  <Text style={[s.weightLabel, { color: colors.textSecondary }]}>
                    g / {Math.round(total)}g
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Pressable>
      </Animated.View>
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
    letterSpacing: -0.5,
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
  weightBlock: {
    alignItems: "flex-end",
  },
  weightBig: {
    fontSize: 18,
    fontFamily: fontWeight.bold,
    letterSpacing: -0.5,
    lineHeight: 20,
  },
  weightLabel: {
    fontSize: 10,
    fontFamily: fontWeight.regular,
    lineHeight: 13,
  },
});
