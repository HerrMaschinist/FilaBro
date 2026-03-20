import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import Colors from "@/constants/colors";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import type { Spool } from "@/lib/spoolViewTypes";
import { UsageEventRepository } from "@/src/data/repositories/UsageEventRepository";
import type { UsageEvent } from "@/src/core/domain/usage";
import { fontWeight } from "@/constants/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PrinterApiService } from "@/src/adapters/printer/PrinterApiService";
import type { PrintJob } from "@/src/adapters/printer/types";

function percentColor(pct: number, colors: typeof Colors.dark) {
  if (pct > 50) return colors.success ?? colors.accent;
  if (pct > 20) return colors.warning ?? colors.accent;
  return colors.error;
}

function getColorHex(spool: Spool): string | undefined {
  return spool.filament?.color_hex;
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
    printerProfiles,
  } = useApp();

  const remoteId = parseInt(id ?? "0", 10);
  const spool = spools.find((s) => s.id === remoteId) ?? null;

  const [weightInput, setWeightInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [consumeGrams, setConsumeGrams] = useState("");
  const [consumeNote, setConsumeNote] = useState("");
  const [consumePrinter, setConsumePrinter] = useState<string | null>(null);
  const [consumeError, setConsumeError] = useState<string | null>(null);
  const [isConsuming, setIsConsuming] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [printerJobs, setPrinterJobs] = useState<PrintJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  useEffect(() => {
    if (spool?.remaining_weight !== undefined) {
      setWeightInput(String(Math.round(spool.remaining_weight)));
    }
  }, [spool?.remaining_weight]);

  useEffect(() => {
    if (spool?._localId) {
      UsageEventRepository.listBySpool(spool._localId).then(setUsageEvents);
    }
  }, [spool?._localId]);

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

  const handleConsume = useCallback(async () => {
    if (isConsuming) return;
    const grams = parseFloat(consumeGrams);
    const remaining = spool?.remaining_weight ?? 0;
    if (!grams || grams <= 0) { setConsumeError("Gramm muss > 0 sein."); return; }
    if (grams >= remaining) { setConsumeError("Verbrauch muss kleiner als Restgewicht sein."); return; }
    setConsumeError(null);
    setIsConsuming(true);
    const newRemaining = remaining - grams;
    try {
      if (spool?._localId) {
        // updateWeight schreibt spool_stats + optimistisches UI-Update via AppContext
        await updateWeight(spool.id, newRemaining);
        const events = await UsageEventRepository.listBySpool(spool._localId);
        setUsageEvents(events);
        setConsumeGrams("");
        setConsumeNote("");
      }
    } finally {
      setIsConsuming(false);
    }
  }, [consumeGrams, consumeNote, spool, updateWeight, isConsuming]);

  const loadPrinterJobs = useCallback(async () => {
    setShowImportModal(true);
    setLoadingJobs(true);
    setPrinterJobs([]);
    try {
      const pairs = await AsyncStorage.multiGet(["printer_api_url", "printer_api_adapter"]);
      const url = pairs[0][1] ?? "";
      const adapterName = pairs[1][1] ?? "Moonraker";
      if (!url) return;
      const adapter = PrinterApiService.getAdapter(adapterName);
      if (!adapter) return;
      const jobs = await adapter.getRecentJobs(url, 5);
      setPrinterJobs(jobs.filter((j) => j.status === "completed"));
    } catch {
      // keine Verbindung
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const s = makeStyles(colors, isDark);
  const bottomInset = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const gradStart = isDark ? "#0B0F1A" : "#F0F4FA";
  const gradEnd   = isDark ? "#0F1425" : "#E8EFF9";

  if (!spool) {
    return (
      <LinearGradient colors={[gradStart, gradEnd]} style={s.center}>
        <Stack.Screen options={{ title: t("detail.not_found") }} />
        <Text style={[s.notFound, { color: colors.textSecondary }]}>
          {t("detail.not_found")}
        </Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[gradStart, gradEnd]} style={{ flex: 1 }}>
    <ScrollView
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

      <View style={s.headerBlock}>
        <View style={s.titleBlock}>
          {spool.filament?.vendor?.name && (
            <Text style={[s.titleVendor, { color: colors.textSecondary }]}>
              {spool.filament.vendor.name}
            </Text>
          )}
          <Text style={[s.titleName, { color: colors.text }]} numberOfLines={2}>
            {spool.filament?.name ?? `Spool #${spool.id}`}
          </Text>
          {spool.filament?.material && (
            <View style={[s.materialBadge, { backgroundColor: `${colors.accent}1A` }]}>
              <Text style={[s.materialBadgeText, { color: colors.accent }]}>
                {spool.filament.material}
              </Text>
            </View>
          )}
        </View>
        {spool.lot_nr && (
          <Text style={[s.sub, { color: colors.textSecondary }]}>
            {t("detail.lot")} {spool.lot_nr}
          </Text>
        )}
        <View style={s.headerActions}>
          <Pressable style={s.actionBtn} onPress={() => toggleFavorite(spool.id)} hitSlop={12}>
            <Ionicons name={favorite ? "heart" : "heart-outline"} size={24} color={favorite ? colors.error : colors.textTertiary} />
          </Pressable>
          {spool._localId && (
            <Pressable style={s.actionBtn} onPress={() => router.push("/(tabs)/scanner")} hitSlop={12} testID="bind-qr-barcode">
              <Ionicons name="qr-code-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          )}
          {spool._localId && Platform.OS !== "web" && (
            <Pressable style={s.actionBtn} onPress={() => router.push(`/nfc-write?localId=${spool._localId}`)} hitSlop={12} testID="write-nfc-tag">
              <Ionicons name="radio-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          )}
          <Pressable style={s.actionBtn} onPress={() => spool._localId && router.push(`/edit-spool?localId=${spool._localId}`)} hitSlop={12} testID="edit-spool">
            <Ionicons name="create-outline" size={22} color={colors.textSecondary} />
          </Pressable>
          <Pressable style={s.actionBtn} onPress={handleDelete} hitSlop={12} testID="delete-spool">
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
            <View style={s.weightMain}>
              <Text style={[s.weightNum, { color: barColor }]}>
                {Math.round(remaining)}
              </Text>
              <Text style={[s.weightUnit, { color: colors.textSecondary }]}>g</Text>
            </View>
            <View style={s.weightMeta}>
              <Text style={[s.weightTotal, { color: colors.textTertiary }]}>
                von {Math.round(total)}g
              </Text>
              <Text style={[s.weightTare, { color: colors.textTertiary }]}>
                {spool.filament?.weight != null
                  ? `Leer: ${Math.round((spool.filament.weight ?? 0) - (spool.initial_weight ?? 0))}g`
                  : ""}
              </Text>
            </View>
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
            <PrimaryButton
              label={t("common.save")}
              onPress={saveWeight}
              loading={isSaving}
              disabled={isSaving}
              testID="save-weight"
              style={s.saveBtn}
            />
          </View>
          {saveError && (
            <Text style={[s.errorText, { color: colors.error }]}>{saveError}</Text>
          )}
        </View>
      </GlassCard>

      {/* ── Druck abrechnen ── */}
      <Text style={[s.cardTitle, { color: colors.textSecondary, marginBottom: 8, marginTop: 4, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontFamily: "Inter_600SemiBold" }]}>DRUCK ABRECHNEN</Text>
      <GlassCard style={s.glassCard}>
        <View style={s.cardInner}>
          <TextInput
            style={[s.consumeInput, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: colors.text, borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }]}
            value={consumeGrams}
            onChangeText={(v) => { setConsumeGrams(v); setConsumeError(null); }}
            placeholder="Verbrauch in Gramm"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
          />
          {printerProfiles.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  style={[s.printerChip, consumePrinter === null && { backgroundColor: colors.accent }]}
                  onPress={() => setConsumePrinter(null)}
                >
                  <Text style={{ color: consumePrinter === null ? "#fff" : colors.textSecondary, fontSize: 12 }}>Kein Drucker</Text>
                </Pressable>
                {printerProfiles.map((p) => (
                  <Pressable
                    key={p.localId}
                    style={[s.printerChip, consumePrinter === p.localId && { backgroundColor: colors.accent }]}
                    onPress={() => setConsumePrinter(p.localId)}
                  >
                    <Text style={{ color: consumePrinter === p.localId ? "#fff" : colors.textSecondary, fontSize: 12 }}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}
          {consumeError && <Text style={{ color: colors.error, fontSize: 12, marginBottom: 8 }}>{consumeError}</Text>}
          <Pressable
            style={[s.consumeBtn, { backgroundColor: isConsuming ? colors.textTertiary : colors.accent }]}
            onPress={handleConsume}
            disabled={isConsuming}
          >
            {isConsuming
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ color: "#fff", fontFamily: fontWeight.semibold, fontSize: 14 }}>Abrechnen</Text>
            }
          </Pressable>
          <Pressable
            style={[s.importBtn, { borderColor: colors.accent }]}
            onPress={loadPrinterJobs}
          >
            <Ionicons name="cloud-download-outline" size={14} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: fontWeight.medium, fontSize: 13, marginLeft: 6 }}>
              Vom Drucker importieren
            </Text>
          </Pressable>
          {spool?.filament?.paid_price != null && spool.filament.weight != null && parseFloat(consumeGrams) > 0 && (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>
              ~{((parseFloat(consumeGrams) / spool.filament.weight) * spool.filament.paid_price).toFixed(2)} € für diesen Druck
            </Text>
          )}
          {spool?.filament?.paid_price == null && (
            <Pressable onPress={() => router.push({ pathname: "/edit-filament", params: { localId: spool?._filamentLocalId } })}>
              <Text style={{ color: colors.accent, fontSize: 12, marginTop: 6 }}>Preis hinterlegen →</Text>
            </Pressable>
          )}
        </View>
      </GlassCard>

      {/* ── Verbrauchshistorie ── */}
      {usageEvents.length > 0 && (
        <>
          <Text style={[s.cardTitle, { color: colors.textSecondary, marginBottom: 8, marginTop: 4, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontFamily: "Inter_600SemiBold" }]}>VERBRAUCH</Text>
          <GlassCard style={s.glassCard}>
            <View style={s.cardInner}>
              {usageEvents.slice(-5).reverse().map((ev) => (
                <View key={ev.id} style={s.eventRow}>
                  <Ionicons
                    name={ev.type === "consume" ? "flash-outline" : "swap-horizontal-outline"}
                    size={14}
                    color={colors.accent}
                  />
                  <Text style={[s.eventDate, { color: colors.textTertiary }]}>
                    {new Date(ev.occurredAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
                  </Text>
                  <Text style={[s.eventGrams, { color: colors.text }]}>
                    {ev.type === "consume" ? `-${ev.grams}g` : `=${ev.grams}g`}
                  </Text>
                  {ev.note && <Text style={[s.eventNote, { color: colors.textSecondary }]}>{ev.note}</Text>}
                </View>
              ))}
              {usageEvents.length > 5 && (
                <Text style={[s.eventMore, { color: colors.accent }]}>
                  + {usageEvents.length - 5} weitere Einträge
                </Text>
              )}
            </View>
          </GlassCard>
        </>
      )}

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

    <Modal
      visible={showImportModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowImportModal(false)}
    >
      <Pressable style={s.modalOverlay} onPress={() => setShowImportModal(false)}>
        <View style={[s.modalSheet, { backgroundColor: colors.surface }]}>
          <Text style={[s.modalTitle, { color: colors.text }]}>Letzte Druckjobs</Text>
          {loadingJobs ? (
            <ActivityIndicator style={{ marginVertical: 20 }} color={colors.accent} />
          ) : printerJobs.length === 0 ? (
            <Text style={{ color: colors.textSecondary, textAlign: "center", marginVertical: 16 }}>
              Keine Jobs gefunden. Drucker-URL in den Einstellungen prüfen.
            </Text>
          ) : (
            printerJobs.map((job) => {
              const DENSITY: Record<string, number> = { PLA: 1.24, PETG: 1.27, TPU: 1.04, ABS: 1.05 };
              const weightG = job.filamentWeightG !== null
                ? job.filamentWeightG
                : (job.filamentUsedMm * Math.PI * Math.pow(1.75 / 2, 2) *
                    (DENSITY[(job.filamentType ?? "").toUpperCase()] ?? 1.24)) / 1000;
              const date = job.endTime
                ? new Date(job.endTime).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })
                : "?";
              return (
                <Pressable
                  key={job.jobId}
                  style={[s.jobRow, { borderBottomColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]}
                  onPress={() => { setConsumeGrams(weightG.toFixed(1)); setShowImportModal(false); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: colors.text, fontSize: 13, fontFamily: fontWeight.medium }}
                      numberOfLines={1}
                    >
                      {job.filename.replace(/\.gcode$/i, "")}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {job.filamentType ?? "?"} · {date}
                    </Text>
                  </View>
                  <Text style={{ color: colors.accent, fontFamily: fontWeight.semibold, fontSize: 14 }}>
                    {weightG.toFixed(1)}g
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      </Pressable>
    </Modal>
    </LinearGradient>
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
    headerBlock: {
      flexDirection: "column",
      marginBottom: 16,
      gap: 8,
    },
    titleBlock: {
      gap: 4,
      marginBottom: 2,
    },
    titleVendor: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      letterSpacing: 0.2,
    },
    titleName: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.5,
      lineHeight: 28,
    },
    materialBadge: {
      alignSelf: "flex-start",
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    materialBadgeText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.3,
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
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginTop: 10,
    },
    weightMain: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 2,
    },
    weightNum: {
      fontSize: 36,
      fontFamily: "Inter_700Bold",
      letterSpacing: -1,
    },
    weightUnit: {
      fontSize: 18,
      fontFamily: "Inter_400Regular",
      marginBottom: 2,
    },
    weightMeta: {
      alignItems: "flex-end",
      gap: 2,
    },
    weightTotal: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
    },
    weightTare: {
      fontSize: 11,
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
    consumeInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      marginBottom: 10,
    },
    consumeBtn: {
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    printerChip: {
      borderRadius: 8,
      paddingVertical: 5,
      paddingHorizontal: 12,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
    },
    eventRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 5,
    },
    eventDate: { fontSize: 12, fontFamily: "Inter_400Regular", width: 60 },
    eventGrams: { fontSize: 13, fontFamily: "Inter_600SemiBold", width: 55 },
    eventNote: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
    eventMore: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 6 },
    importBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 10,
      marginTop: 8,
      gap: 4,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end" as const,
    },
    modalSheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 44,
    },
    modalTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      marginBottom: 16,
    },
    jobRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 12,
    },
  });
}