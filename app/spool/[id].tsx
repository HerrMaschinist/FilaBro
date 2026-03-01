import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Spool } from "@/lib/spoolman";

function percentColor(pct: number, colors: typeof Colors.dark) {
  if (pct > 50) return colors.success ?? colors.accent;
  if (pct > 20) return colors.warning ?? colors.accent;
  return colors.error;
}

function getColorHex(spool: Spool): string | undefined {
  return spool.filament?.color_hex;
}

function getFilamentLabel(spool: Spool): string {
  const f = spool.filament;
  if (!f) return `Spool #${spool.id}`;
  const parts: string[] = [];
  if (f.vendor?.name) parts.push(f.vendor.name);
  if (f.name) parts.push(f.name);
  if (f.material) parts.push(f.material);
  return parts.join(" · ") || `Spool #${spool.id}`;
}

export default function SpoolDetailScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    spools,
    updateWeight,
    toggleFavorite,
    isFavorite,
    deleteSpool,
  } = useApp();

  const remoteId = parseInt(id ?? "0", 10);
  const spool = spools.find((s) => s.id === remoteId) ?? null;

  const [weightInput, setWeightInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (spool?.remaining_weight !== undefined) {
      setWeightInput(String(Math.round(spool.remaining_weight)));
    }
  }, [spool?.remaining_weight]);

  const remaining = spool?.remaining_weight ?? spool?.initial_weight ?? 0;
  const total = spool?.initial_weight ?? spool?.filament?.weight ?? 1000;
  const percent = total > 0 ? Math.round((remaining / total) * 100) : 0;

  const colorHex = getColorHex(spool ?? ({} as Spool));
  const barColor = percentColor(percent, colors);
  const favorite = spool ? isFavorite(spool.id) : false;

  const saveWeight = useCallback(async () => {
    if (!spool) return;
    const parsed = parseFloat(weightInput);
    if (isNaN(parsed) || parsed < 0) {
      Alert.alert(t("detail.invalid_weight"), t("detail.invalid_weight_msg"));
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateWeight(spool.id, parsed);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t("detail.save_failed"));
    } finally {
      setIsSaving(false);
    }
  }, [spool, weightInput, updateWeight, t]);

  const handleDelete = useCallback(() => {
    if (!spool) return;
    const localId = spool._localId ?? `id-${spool.id}`;
    Alert.alert(
      t("catalog.confirm_delete"),
      t("catalog.confirm_delete_msg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await deleteSpool(localId);
            router.back();
          },
        },
      ]
    );
  }, [spool, deleteSpool, t]);

  const s = makeStyles(colors, isDark);
  const bottomInset = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  if (!spool) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: t("detail.not_found") }} />
        <Text style={[s.notFound, { color: colors.textSecondary }]}>
          {t("detail.not_found")}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[s.content, { paddingBottom: bottomInset + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen
        options={{
          title: spool.filament?.name ?? `Spool #${spool.id}`,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <View
        style={[
          s.colorStrip,
          { backgroundColor: colorHex ? `#${colorHex}` : colors.accent },
        ]}
      />

      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.text }]}>
            {getFilamentLabel(spool)}
          </Text>
          {spool.lot_nr && (
            <Text style={[s.sub, { color: colors.textSecondary }]}>
              {t("detail.lot")} {spool.lot_nr}
            </Text>
          )}
        </View>
        <View style={s.headerActions}>
          <Pressable
            style={s.actionBtn}
            onPress={() => toggleFavorite(spool.id)}
            hitSlop={12}
          >
            <Ionicons
              name={favorite ? "heart" : "heart-outline"}
              size={24}
              color={favorite ? colors.error : colors.textTertiary}
            />
          </Pressable>
          <Pressable
            style={s.actionBtn}
            onPress={() => spool._localId && router.push(`/edit-spool?localId=${spool._localId}`)}
            hitSlop={12}
            testID="edit-spool"
          >
            <Ionicons name="create-outline" size={22} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={s.actionBtn}
            onPress={handleDelete}
            hitSlop={12}
            testID="delete-spool"
          >
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </Pressable>
        </View>
      </View>

      <GlassCard style={s.glassCard}>
        <View style={s.cardInner}>
          <View style={s.barHeader}>
            <Text style={[s.barLabel, { color: colors.textSecondary }]}>
              {t("detail.remaining")}
            </Text>
            <Text style={[s.barPct, { color: barColor }]}>{percent}%</Text>
          </View>
          <View style={[s.track, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]}>
            <View
              style={[
                s.fill,
                { width: `${Math.max(2, percent)}%`, backgroundColor: barColor },
              ]}
            />
          </View>
          <View style={s.weightRow}>
            <Text style={[s.weightNum, { color: colors.text }]}>
              {Math.round(remaining)}g
            </Text>
            <Text style={[s.weightTotal, { color: colors.textSecondary }]}>
              / {Math.round(total)}g
            </Text>
          </View>
        </View>
      </GlassCard>

      <GlassCard style={s.glassCard}>
        <View style={s.cardInner}>
          <Text style={[s.cardTitle, { color: colors.textSecondary }]}>
            {t("detail.update_weight")}
          </Text>
          <View style={s.inputRow}>
            <TextInput
              style={[
                s.weightInput,
                {
                  backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                  color: colors.text,
                  borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
                },
              ]}
              value={weightInput}
              onChangeText={setWeightInput}
              keyboardType="decimal-pad"
              placeholder={t("detail.weight_placeholder")}
              placeholderTextColor={colors.textTertiary}
              returnKeyType="done"
              onSubmitEditing={saveWeight}
            />
            <Text style={[s.unit, { color: colors.textSecondary }]}>g</Text>
            <Pressable
              style={[
                s.saveBtn,
                { backgroundColor: colors.accent },
                isSaving && { opacity: 0.5 },
              ]}
              onPress={saveWeight}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.saveBtnLabel}>{t("common.save")}</Text>
              )}
            </Pressable>
          </View>
          {saveError && (
            <Text style={[s.errorText, { color: colors.error }]}>{saveError}</Text>
          )}
        </View>
      </GlassCard>

      {spool.filament && (
        <GlassCard style={s.glassCard}>
          <View style={s.cardInner}>
            <View style={s.cardTitleRow}>
              <Text style={[s.cardTitle, { color: colors.textSecondary, marginBottom: 0 }]}>
                {t("detail.filament")}
              </Text>
              {spool._filamentLocalId && (
                <Pressable
                  onPress={() => router.push(`/edit-filament?localId=${spool._filamentLocalId}`)}
                  hitSlop={8}
                  testID="edit-filament"
                >
                  <Ionicons name="create-outline" size={16} color={colors.accent} />
                </Pressable>
              )}
            </View>
            <InfoRow label={t("detail.name")} value={spool.filament.name} colors={colors} isDark={isDark} />
            <InfoRow label={t("detail.material")} value={spool.filament.material} colors={colors} isDark={isDark} />
            {spool.filament.vendor?.name && (
              <InfoRow label={t("detail.manufacturer")} value={spool.filament.vendor.name} colors={colors} isDark={isDark} />
            )}
            {(spool.filament.color_name || spool.filament.color_hex || spool.filament.color_hex_normalized) && (() => {
              const displayHex = spool.filament.color_hex_normalized
                ?? (spool.filament.color_hex ? `#${spool.filament.color_hex}` : undefined);
              const swatchHex = spool.filament.color_hex_normalized
                ? spool.filament.color_hex_normalized.replace(/^#/, "")
                : spool.filament.color_hex;
              const displayValue = spool.filament.color_name ?? displayHex ?? "";
              const subValueText = spool.filament.color_name && displayHex ? displayHex : undefined;
              return (
                <InfoRow
                  label={t("detail.color")}
                  value={displayValue}
                  subValue={subValueText}
                  colors={colors}
                  isDark={isDark}
                  colorSwatch={swatchHex}
                />
              );
            })()}
            {spool.filament.weight !== undefined && (
              <InfoRow label={t("detail.full_weight")} value={`${spool.filament.weight}g`} colors={colors} isDark={isDark} />
            )}
            {spool.filament.spool_weight !== undefined && (
              <InfoRow label={t("detail.spool_empty")} value={`${spool.filament.spool_weight}g`} colors={colors} isDark={isDark} />
            )}
            {spool.filament.paid_price !== undefined && (
              <InfoRow label={t("form.paid_price")} value={String(spool.filament.paid_price)} colors={colors} isDark={isDark} />
            )}
            {spool.filament.shop && (
              <InfoRow label={t("form.shop")} value={spool.filament.shop} colors={colors} isDark={isDark} />
            )}
          </View>
        </GlassCard>
      )}

      <GlassCard style={s.glassCard}>
        <View style={s.cardInner}>
          <Text style={[s.cardTitle, { color: colors.textSecondary }]}>{t("detail.info")}</Text>
          <InfoRow label={t("detail.id")} value={`#${spool.id}`} colors={colors} isDark={isDark} />
          {spool.comment && (
            <InfoRow label={t("detail.comment")} value={spool.comment} colors={colors} isDark={isDark} />
          )}
          {spool.first_used && (
            <InfoRow label={t("detail.first_used")} value={new Date(spool.first_used).toLocaleDateString()} colors={colors} isDark={isDark} />
          )}
          {spool.last_used && (
            <InfoRow label={t("detail.last_used")} value={new Date(spool.last_used).toLocaleDateString()} colors={colors} isDark={isDark} />
          )}
          {spool.registered && (
            <InfoRow label={t("detail.registered")} value={new Date(spool.registered).toLocaleDateString()} colors={colors} isDark={isDark} />
          )}
          <InfoRow label={t("detail.archived")} value={spool.archived ? t("detail.yes") : t("detail.no")} colors={colors} isDark={isDark} />
        </View>
      </GlassCard>
    </ScrollView>
  );
}

function InfoRow({
  label,
  value,
  subValue,
  colors,
  isDark,
  colorSwatch,
}: {
  label: string;
  value: string;
  subValue?: string;
  colors: typeof Colors.dark;
  isDark: boolean;
  colorSwatch?: string;
}) {
  return (
    <View style={[ir.row, { borderBottomColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)" }]}>
      <Text style={[ir.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={ir.valueRow}>
        {colorSwatch && (
          <View style={[ir.swatch, { backgroundColor: `#${colorSwatch}` }]} />
        )}
        <View style={ir.valueStack}>
          <Text style={[ir.value, { color: colors.text }]}>{value}</Text>
          {subValue && (
            <Text style={[ir.subValue, { color: colors.textTertiary }]}>{subValue}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const ir = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 2,
    justifyContent: "flex-end",
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  valueStack: {
    alignItems: "flex-end",
    flexShrink: 1,
  },
  value: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  subValue: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 1,
  },
});

function makeStyles(colors: typeof Colors.dark, isDark: boolean) {
  return StyleSheet.create({
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    notFound: {
      fontSize: 16,
      fontFamily: "Inter_400Regular",
    },
    content: {
      paddingHorizontal: 16,
    },
    colorStrip: {
      height: 6,
      borderRadius: 3,
      marginBottom: 16,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 16,
    },
    title: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.5,
      flexShrink: 1,
    },
    sub: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginLeft: 12,
    },
    actionBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
    },
    glassCard: {
      marginBottom: 12,
    },
    cardInner: {
      padding: 16,
    },
    cardTitle: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 1,
      textTransform: "uppercase" as const,
      marginBottom: 12,
    },
    cardTitleRow: {
      flexDirection: "row" as const,
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    barHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    barLabel: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
    },
    barPct: {
      fontSize: 13,
      fontFamily: "Inter_700Bold",
    },
    track: {
      height: 10,
      borderRadius: 5,
      overflow: "hidden",
    },
    fill: {
      height: 10,
      borderRadius: 5,
    },
    weightRow: {
      flexDirection: "row",
      alignItems: "baseline",
      marginTop: 8,
      gap: 4,
    },
    weightNum: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
    },
    weightTotal: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    weightInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 18,
      fontFamily: "Inter_500Medium",
    },
    unit: {
      fontSize: 16,
      fontFamily: "Inter_500Medium",
    },
    saveBtn: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 10,
      minWidth: 70,
      alignItems: "center",
      justifyContent: "center",
    },
    saveBtnLabel: {
      color: "#fff",
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    errorText: {
      marginTop: 8,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
    },
  });
}
