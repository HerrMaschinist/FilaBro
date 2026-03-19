import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  Modal,
  FlatList,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import { MATERIALS } from "@/src/features/catalog/CatalogService";
import { normalizeColor } from "@/src/core/application/filament/ColorNormalizer";
import { FilamentUseCase } from "@/src/core/application/FilamentUseCase";
import { CatalogRepository, CatalogSearchResult } from "@/src/data/repositories/CatalogRepository";
import { isCatalogReady } from "@/src/data/db/catalog_client";

function safeBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/");
  }
}

export default function AddFilamentScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { manufacturers, createFilament } = useApp();

  const [name, setName] = useState("");
  const [material, setMaterial] = useState("");
  const [manufacturerLocalId, setManufacturerLocalId] = useState("");
  const [colorInput, setColorInput] = useState("");
  const [weight, setWeight] = useState("");
  const [spoolWeight, setSpoolWeight] = useState("");
  const [comment, setComment] = useState("");
  const [diameterMm, setDiameterMm] = useState("");
  const [printTempCMin, setPrintTempCMin] = useState("");
  const [printTempCMax, setPrintTempCMax] = useState("");
  const [bedTempCMin, setBedTempCMin] = useState("");
  const [bedTempCMax, setBedTempCMax] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMfrPicker, setShowMfrPicker] = useState(false);

  // OFD Catalog search
  const [showCatalogSearch, setShowCatalogSearch] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogSearchResult[]>([]);

  const selectedMfr = manufacturers.find(
    (m) => m.localId === manufacturerLocalId
  );
  const canSave = name.trim().length > 0 && material.length > 0;

  const colorPreviewHex = useMemo(() => {
    if (!colorInput.trim()) return null;
    const nc = normalizeColor(colorInput);
    return nc.colorHexNormalized ?? null;
  }, [colorInput]);

  const applyMaterialDefaults = (mat: string) => {
    setMaterial(mat);
    Haptics.selectionAsync();
    if (!printTempCMin && !printTempCMax && !bedTempCMin && !bedTempCMax) {
      const defaults = FilamentUseCase.applyMaterialDefaults(mat, {});
      if (defaults.printTempCMin) setPrintTempCMin(String(defaults.printTempCMin));
      if (defaults.printTempCMax) setPrintTempCMax(String(defaults.printTempCMax));
      if (defaults.bedTempCMin) setBedTempCMin(String(defaults.bedTempCMin));
      if (defaults.bedTempCMax) setBedTempCMax(String(defaults.bedTempCMax));
    }
  };

  const handleCatalogSearch = (query: string) => {
    setCatalogQuery(query);
    if (query.trim().length < 2) {
      setCatalogResults([]);
      return;
    }
    if (!isCatalogReady()) return;
    const results = CatalogRepository.searchByName(query);
    setCatalogResults(results.slice(0, 30));
  };

  const applyCatalogResult = (result: CatalogSearchResult) => {
    setName(result.filament.name);
    setMaterial(result.filament.material);
    if (result.filament.minPrintTemp) setPrintTempCMin(String(result.filament.minPrintTemp));
    if (result.filament.maxPrintTemp) setPrintTempCMax(String(result.filament.maxPrintTemp));
    if (result.filament.minBedTemp) setBedTempCMin(String(result.filament.minBedTemp));
    if (result.filament.maxBedTemp) setBedTempCMax(String(result.filament.maxBedTemp));
    if (result.variant.colorHex) setColorInput(result.variant.colorHex);
    setShowCatalogSearch(false);
    setCatalogQuery("");
    setCatalogResults([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t("common.error"), t("validation.name_required"));
      return;
    }
    if (!material) {
      Alert.alert(t("common.error"), t("validation.material_required"));
      return;
    }

    const parsedWeight = weight ? parseFloat(weight) : undefined;
    const parsedSpoolWeight = spoolWeight ? parseFloat(spoolWeight) : undefined;
    const parsedDiameter = diameterMm ? parseFloat(diameterMm) : undefined;
    const parsedPrintMin = printTempCMin ? parseInt(printTempCMin, 10) : undefined;
    const parsedPrintMax = printTempCMax ? parseInt(printTempCMax, 10) : undefined;
    const parsedBedMin = bedTempCMin ? parseInt(bedTempCMin, 10) : undefined;
    const parsedBedMax = bedTempCMax ? parseInt(bedTempCMax, 10) : undefined;

    if (weight && (isNaN(parsedWeight!) || parsedWeight! <= 0)) {
      Alert.alert(t("common.error"), t("validation.weight_invalid"));
      return;
    }

    const specPatch: Record<string, number | undefined> = {};
    if (parsedDiameter !== undefined) specPatch.diameterMm = parsedDiameter;
    if (parsedPrintMin !== undefined) specPatch.printTempCMin = parsedPrintMin;
    if (parsedPrintMax !== undefined) specPatch.printTempCMax = parsedPrintMax;
    if (parsedBedMin !== undefined) specPatch.bedTempCMin = parsedBedMin;
    if (parsedBedMax !== undefined) specPatch.bedTempCMax = parsedBedMax;

    if (Object.keys(specPatch).length > 0) {
      const validation = FilamentUseCase.validateSpec(specPatch);
      if (!validation.valid) {
        if (
          validation.errors.includes("PRINT_TEMP_MIN_GT_MAX") ||
          validation.errors.includes("BED_TEMP_MIN_GT_MAX")
        ) {
          Alert.alert(
            t("common.error"),
            t("validation.temp_min_gt_max", "Min temp must be less than max temp")
          );
          return;
        }
        if (validation.errors.includes("PRINT_TEMP_OUT_OF_RANGE")) {
          Alert.alert(
            t("common.error"),
            t("validation.temp_out_of_range", "Temperature must be between 150°C and 350°C")
          );
          return;
        }
      }
    }

    setSaving(true);
    try {
      const result = await createFilament({
        name: name.trim(),
        material,
        colorInput: colorInput.trim() || undefined,
        manufacturerLocalId: manufacturerLocalId || undefined,
        weight: parsedWeight,
        spoolWeight: parsedSpoolWeight,
        comment: comment.trim() || undefined,
        spec: Object.keys(specPatch).length > 0 ? specPatch : undefined,
      });

      if (result) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeBack();
      } else {
        Alert.alert(t("common.error"), t("catalog.persistence_required"));
      }
    } catch (err) {
      Alert.alert(t("common.error"), String(err));
    } finally {
      setSaving(false);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: topInset + 16,
            paddingBottom: insets.bottom + 32,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t("catalog.add_filament")}
          </Text>
          <Pressable
            onPress={safeBack}
            hitSlop={12}
            testID="close-filament"
          >
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.surfaceBorder,
            },
          ]}
        >
          <Pressable
            onPress={() => setShowCatalogSearch(true)}
            style={[styles.catalogBtn, { backgroundColor: `${colors.accent}15`, borderColor: `${colors.accent}30` }]}
          >
            <Ionicons name="search-outline" size={16} color={colors.accent} />
            <Text style={[styles.catalogBtnText, { color: colors.accent }]}>
              Aus Katalog importieren
            </Text>
          </Pressable>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.name")} *
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder={t("form.name")}
            placeholderTextColor={colors.textTertiary}
            autoFocus
            testID="input-filament-name"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.material")} *
          </Text>
          <View style={styles.chipRow}>
            {MATERIALS.map((m) => (
              <Pressable
                key={m}
                style={[
                  styles.chip,
                  {
                    borderColor: colors.surfaceBorder,
                    backgroundColor: colors.surfaceElevated,
                  },
                  material === m && {
                    backgroundColor: `${colors.accent}20`,
                    borderColor: colors.accent,
                  },
                ]}
                onPress={() => applyMaterialDefaults(m)}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color:
                        material === m
                          ? colors.accent
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {m}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.manufacturer")}
          </Text>
          <Pressable
            style={[
              styles.pickerBtn,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.surfaceBorder,
              },
            ]}
            onPress={() => setShowMfrPicker(true)}
            testID="pick-manufacturer"
          >
            <Text
              style={[
                styles.pickerText,
                {
                  color: selectedMfr
                    ? colors.text
                    : colors.textTertiary,
                },
              ]}
            >
              {selectedMfr?.name ?? t("catalog.select_manufacturer")}
            </Text>
            <Ionicons
              name="chevron-down"
              size={18}
              color={colors.textTertiary}
            />
          </Pressable>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.surfaceBorder,
            },
          ]}
        >
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.color")}
          </Text>
          <View style={styles.colorRow}>
            <TextInput
              style={[
                styles.input,
                styles.colorInput,
                {
                  backgroundColor: colors.surfaceElevated,
                  color: colors.text,
                },
              ]}
              value={colorInput}
              onChangeText={setColorInput}
              placeholder={t("form.color_placeholder")}
              placeholderTextColor={colors.textTertiary}
              testID="input-filament-color"
            />
            {colorPreviewHex ? (
              <View
                style={[
                  styles.colorPreview,
                  { backgroundColor: colorPreviewHex },
                ]}
              />
            ) : null}
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.total_weight")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
            ]}
            value={weight}
            onChangeText={setWeight}
            placeholder="1000"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
            testID="input-filament-weight"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.spool_weight")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
            ]}
            value={spoolWeight}
            onChangeText={setSpoolWeight}
            placeholder="200"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
            testID="input-filament-spool-weight"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.comment")}
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.multiline,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
            ]}
            value={comment}
            onChangeText={setComment}
            placeholder={`${t("form.comment")} (${t("form.optional")})`}
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
          />
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.surfaceBorder,
            },
          ]}
        >
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
            {t("form.spec_section")}
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.diameter_mm")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
            ]}
            value={diameterMm}
            onChangeText={setDiameterMm}
            placeholder="1.75"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            testID="input-filament-diameter"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.print_temp_c_min")} / {t("form.print_temp_c_max")}
          </Text>
          <View style={styles.rangeRow}>
            <TextInput
              style={[
                styles.input,
                styles.rangeInput,
                {
                  backgroundColor: colors.surfaceElevated,
                  color: colors.text,
                },
              ]}
              value={printTempCMin}
              onChangeText={setPrintTempCMin}
              placeholder="190"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numeric"
              testID="input-filament-print-temp-min"
            />
            <Text style={[styles.rangeSep, { color: colors.textTertiary }]}>–</Text>
            <TextInput
              style={[
                styles.input,
                styles.rangeInput,
                {
                  backgroundColor: colors.surfaceElevated,
                  color: colors.text,
                },
              ]}
              value={printTempCMax}
              onChangeText={setPrintTempCMax}
              placeholder="220"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numeric"
              testID="input-filament-print-temp-max"
            />
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.bed_temp_c_min")} / {t("form.bed_temp_c_max")}
          </Text>
          <View style={styles.rangeRow}>
            <TextInput
              style={[
                styles.input,
                styles.rangeInput,
                {
                  backgroundColor: colors.surfaceElevated,
                  color: colors.text,
                },
              ]}
              value={bedTempCMin}
              onChangeText={setBedTempCMin}
              placeholder="55"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numeric"
              testID="input-filament-bed-temp-min"
            />
            <Text style={[styles.rangeSep, { color: colors.textTertiary }]}>–</Text>
            <TextInput
              style={[
                styles.input,
                styles.rangeInput,
                {
                  backgroundColor: colors.surfaceElevated,
                  color: colors.text,
                },
              ]}
              value={bedTempCMax}
              onChangeText={setBedTempCMax}
              placeholder="65"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numeric"
              testID="input-filament-bed-temp-max"
            />
          </View>
        </View>

        <Pressable
          style={[
            styles.saveBtn,
            {
              backgroundColor: canSave
                ? colors.accent
                : colors.surfaceElevated,
              opacity: saving ? 0.7 : 1,
            },
          ]}
          onPress={handleSave}
          disabled={!canSave || saving}
          testID="save-filament"
        >
          <Text
            style={[
              styles.saveBtnText,
              { color: canSave ? "#fff" : colors.textTertiary },
            ]}
          >
            {t("common.save")}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={showCatalogSearch}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCatalogSearch(false)}
      >
        <View style={styles.catalogModalOverlay}>
          <View style={[styles.catalogSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.surfaceBorder }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Katalog durchsuchen</Text>
            <View style={[styles.catalogSearchRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.surfaceBorder }]}>
              <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
              <TextInput
                style={[styles.catalogSearchInput, { color: colors.text }]}
                value={catalogQuery}
                onChangeText={handleCatalogSearch}
                placeholder="Hersteller, Material oder Name..."
                placeholderTextColor={colors.textTertiary}
                autoFocus
              />
            </View>
            <FlatList
              data={catalogResults}
              keyExtractor={(item) => item.variant.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.catalogItem, { borderBottomColor: colors.surfaceBorder }]}
                  onPress={() => applyCatalogResult(item)}
                >
                  <View style={[styles.catalogColorDot, { backgroundColor: item.variant.colorHex ?? colors.textTertiary }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.catalogItemName, { color: colors.text }]} numberOfLines={1}>
                      {item.brand.name} – {item.filament.name}
                    </Text>
                    <Text style={[styles.catalogItemSub, { color: colors.textSecondary }]}>
                      {item.filament.material} · {item.variant.name}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              )}
              ListEmptyComponent={
                catalogQuery.length >= 2 ? (
                  <Text style={[styles.catalogEmpty, { color: colors.textTertiary }]}>Keine Treffer</Text>
                ) : null
              }
              keyboardShouldPersistTaps="handled"
            />
            <Pressable
              onPress={() => setShowCatalogSearch(false)}
              style={[styles.catalogCloseBtn, { backgroundColor: colors.surfaceElevated }]}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 15, fontFamily: "Inter_500Medium" }}>Schließen</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showMfrPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMfrPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.pickerSheet,
              {
                backgroundColor: colors.surface,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View
              style={[
                styles.sheetHandle,
                { backgroundColor: colors.surfaceBorder },
              ]}
            />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {t("catalog.select_manufacturer")}
              </Text>
              <Pressable
                onPress={() => setShowMfrPicker(false)}
                hitSlop={8}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>

            <FlatList
              data={manufacturers}
              keyExtractor={(item) => item.localId}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.pickerItem,
                    {
                      backgroundColor:
                        manufacturerLocalId === item.localId
                          ? `${colors.accent}15`
                          : "transparent",
                    },
                  ]}
                  onPress={() => {
                    setManufacturerLocalId(item.localId);
                    setShowMfrPicker(false);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      {
                        color:
                          manufacturerLocalId === item.localId
                            ? colors.accent
                            : colors.text,
                      },
                    ]}
                  >
                    {item.name}
                  </Text>
                  {manufacturerLocalId === item.localId && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={colors.accent}
                    />
                  )}
                </Pressable>
              )}
              ListEmptyComponent={
                <Text
                  style={[
                    styles.emptyPicker,
                    { color: colors.textTertiary },
                  ]}
                >
                  {t("catalog.no_manufacturers")}
                </Text>
              }
              ListFooterComponent={
                <Pressable
                  style={[
                    styles.createNewBtn,
                    { borderColor: colors.accent },
                  ]}
                  onPress={() => {
                    setShowMfrPicker(false);
                    router.push("/add-manufacturer");
                  }}
                >
                  <Ionicons name="add" size={20} color={colors.accent} />
                  <Text
                    style={[
                      styles.createNewText,
                      { color: colors.accent },
                    ]}
                  >
                    {t("catalog.create_new")}
                  </Text>
                </Pressable>
              }
              style={styles.pickerList}
              scrollEnabled={manufacturers.length > 6}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top" as const,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  pickerBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  colorInput: { flex: 1 },
  colorPreview: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rangeInput: { flex: 1 },
  rangeSep: {
    fontSize: 18,
    fontFamily: "Inter_400Regular",
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "60%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  pickerList: { maxHeight: 300 },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  pickerItemText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  emptyPicker: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 20,
  },
  createNewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  createNewText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  colorDotSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  // Catalog search
  catalogBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  catalogBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  catalogModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" as const },
  catalogSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: "85%" as const, paddingBottom: 32 },
  catalogSearchRow: { flexDirection: "row" as const, alignItems: "center" as const, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 12 },
  catalogSearchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", padding: 0 },
  catalogItem: { flexDirection: "row" as const, alignItems: "center" as const, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  catalogColorDot: { width: 20, height: 20, borderRadius: 10 },
  catalogItemName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  catalogItemSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  catalogEmpty: { textAlign: "center" as const, paddingVertical: 32, fontSize: 14, fontFamily: "Inter_400Regular" },
  catalogCloseBtn: { marginTop: 12, borderRadius: 12, paddingVertical: 14, alignItems: "center" as const },
});
