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
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import { MATERIALS } from "@/src/features/catalog/CatalogService";
import { normalizeColor } from "@/src/core/application/filament/ColorNormalizer";

export default function EditFilamentScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const {
    filaments,
    manufacturers,
    updateFilament,
    reloadCatalog,
    reloadSpoolsLocal,
  } = useApp();

  const fil = filaments.find((f) => f.localId === localId);

  const [name, setName] = useState(fil?.name ?? "");
  const [material, setMaterial] = useState(fil?.material ?? "");
  const [manufacturerLocalId, setManufacturerLocalId] = useState(
    fil?.manufacturerLocalId ?? ""
  );
  const [colorInput, setColorInput] = useState(
    fil?.colorNameRaw ?? ""
  );
  const [weight, setWeight] = useState(
    fil?.weight !== undefined ? String(fil.weight) : ""
  );
  const [spoolWeight, setSpoolWeight] = useState(
    fil?.spoolWeight !== undefined ? String(fil.spoolWeight) : ""
  );
  const [paidPrice, setPaidPrice] = useState(
    fil?.paidPrice !== undefined ? String(fil.paidPrice) : ""
  );
  const [shop, setShop] = useState(fil?.shop ?? "");
  const [comment, setComment] = useState(fil?.comment ?? "");

  const [diameterMm, setDiameterMm] = useState(
    fil?.spec?.diameterMm !== undefined ? String(fil.spec.diameterMm) : ""
  );
  const [printTempCMin, setPrintTempCMin] = useState(
    fil?.spec?.printTempCMin !== undefined ? String(fil.spec.printTempCMin) : ""
  );
  const [printTempCMax, setPrintTempCMax] = useState(
    fil?.spec?.printTempCMax !== undefined ? String(fil.spec.printTempCMax) : ""
  );
  const [bedTempCMin, setBedTempCMin] = useState(
    fil?.spec?.bedTempCMin !== undefined ? String(fil.spec.bedTempCMin) : ""
  );
  const [bedTempCMax, setBedTempCMax] = useState(
    fil?.spec?.bedTempCMax !== undefined ? String(fil.spec.bedTempCMax) : ""
  );

  const [saving, setSaving] = useState(false);
  const [showMfrPicker, setShowMfrPicker] = useState(false);

  const selectedMfr = manufacturers.find(
    (m) => m.localId === manufacturerLocalId
  );
  const canSave = name.trim().length > 0 && material.length > 0;

  const colorPreviewHex = useMemo(() => {
    if (!colorInput.trim()) return fil?.colorHexNormalized ?? fil?.colorHex ? `#${fil!.colorHex}` : null;
    const normalized = normalizeColor(colorInput);
    return normalized.colorHexNormalized ?? null;
  }, [colorInput, fil]);

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert(t("common.error"), t("validation.name_required"));
      return;
    }
    if (!localId) return;

    const parsedWeight = weight ? parseFloat(weight) : undefined;
    const parsedSpoolWeight = spoolWeight ? parseFloat(spoolWeight) : undefined;
    const parsedPrice = paidPrice ? parseFloat(paidPrice) : undefined;
    const parsedDiameter = diameterMm ? parseFloat(diameterMm) : undefined;
    const parsedPrintMin = printTempCMin ? parseInt(printTempCMin, 10) : undefined;
    const parsedPrintMax = printTempCMax ? parseInt(printTempCMax, 10) : undefined;
    const parsedBedMin = bedTempCMin ? parseInt(bedTempCMin, 10) : undefined;
    const parsedBedMax = bedTempCMax ? parseInt(bedTempCMax, 10) : undefined;

    if (weight && (isNaN(parsedWeight!) || parsedWeight! <= 0)) {
      Alert.alert(t("common.error"), t("validation.weight_invalid"));
      return;
    }
    if (paidPrice && (isNaN(parsedPrice!) || parsedPrice! < 0)) {
      Alert.alert(t("common.error"), t("validation.price_invalid"));
      return;
    }

    setSaving(true);
    try {
      const spec: Record<string, number | undefined> = {};
      if (parsedDiameter !== undefined) spec.diameterMm = parsedDiameter;
      if (parsedPrintMin !== undefined) spec.printTempCMin = parsedPrintMin;
      if (parsedPrintMax !== undefined) spec.printTempCMax = parsedPrintMax;
      if (parsedBedMin !== undefined) spec.bedTempCMin = parsedBedMin;
      if (parsedBedMax !== undefined) spec.bedTempCMax = parsedBedMax;

      const result = await updateFilament(localId, {
        name: name.trim(),
        material,
        colorInput: colorInput.trim() || undefined,
        manufacturerLocalId: manufacturerLocalId || undefined,
        weight: parsedWeight,
        spoolWeight: parsedSpoolWeight,
        paidPrice: parsedPrice,
        shop: shop.trim() || undefined,
        comment: comment.trim() || undefined,
        spec: Object.keys(spec).length > 0 ? spec : undefined,
      });
      if (result) {
        await reloadCatalog();
        await reloadSpoolsLocal();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
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

  if (!fil) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: topInset + 16 }]}
        >
          <Text
            style={{
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: 40,
            }}
          >
            {t("detail.not_found")}
          </Text>
        </ScrollView>
      </View>
    );
  }

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
            {t("catalog.edit_filament")}
          </Text>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            testID="close-edit-filament"
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
                onPress={() => {
                  setMaterial(m);
                  Haptics.selectionAsync();
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color:
                        material === m ? colors.accent : colors.textSecondary,
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
                  color: selectedMfr ? colors.text : colors.textTertiary,
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
            {t("form.paid_price")} · {t("form.shop")}
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.paid_price")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
            ]}
            value={paidPrice}
            onChangeText={setPaidPrice}
            placeholder="19.99"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            testID="input-filament-price"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.shop")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
            ]}
            value={shop}
            onChangeText={setShop}
            placeholder={`${t("form.shop")} (${t("form.optional")})`}
            placeholderTextColor={colors.textTertiary}
            testID="input-filament-shop"
          />
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
          testID="save-filament-edit"
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
              <Pressable onPress={() => setShowMfrPicker(false)} hitSlop={8}>
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
});
