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

export default function AddSpoolScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { qrCode: qrCodeParam } = useLocalSearchParams<{ qrCode?: string | string[] }>();
  const { manufacturers, filaments, createSpool } = useApp();

  const initialQrCode = Array.isArray(qrCodeParam)
    ? (qrCodeParam[0] ?? "").trim()
    : (qrCodeParam ?? "").trim();

  const [filamentLocalId, setFilamentLocalId] = useState("");
  const [initialWeight, setInitialWeight] = useState("");
  const [spoolWeight, setSpoolWeight] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [lotNr, setLotNr] = useState("");
  const [qrCode, setQrCode] = useState(initialQrCode);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [showFilamentPicker, setShowFilamentPicker] = useState(false);

  const selectedFilament = filaments.find(
    (f) => f.localId === filamentLocalId
  );
  const selectedMfr = selectedFilament?.manufacturerLocalId
    ? manufacturers.find(
        (m) => m.localId === selectedFilament.manufacturerLocalId
      )
    : null;

  const canSave = filamentLocalId.length > 0;

  const enrichedFilaments = useMemo(
    () =>
      filaments.map((f) => ({
        ...f,
        manufacturerName: f.manufacturerLocalId
          ? manufacturers.find(
              (m) => m.localId === f.manufacturerLocalId
            )?.name
          : undefined,
      })),
    [filaments, manufacturers]
  );

  const handleSave = async () => {
    if (!filamentLocalId) {
      Alert.alert(t("common.error"), t("validation.filament_required"));
      return;
    }

    const parsedWeight = initialWeight ? parseFloat(initialWeight) : undefined;
    if (initialWeight && (isNaN(parsedWeight!) || parsedWeight! <= 0)) {
      Alert.alert(t("common.error"), t("validation.weight_invalid"));
      return;
    }

    const parsedSpoolWeight = spoolWeight
      ? parseFloat(spoolWeight)
      : undefined;

    setSaving(true);
    try {
            const ok = await createSpool({
        filamentLocalId,
        initialWeight:
          parsedWeight ?? selectedFilament?.weight ?? 1000,
        remainingWeight:
          parsedWeight ?? selectedFilament?.weight ?? 1000,
        spoolWeight:
          parsedSpoolWeight ?? selectedFilament?.spoolWeight,
        comment: comment.trim() || undefined,
        displayName: displayName.trim() || undefined,
        lotNr: lotNr.trim() || undefined,
        qrCode: qrCode.trim() || undefined,
      });

      if (ok) {
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
  const filamentColor = selectedFilament?.colorHex
    ? selectedFilament.colorHex.startsWith("#")
      ? selectedFilament.colorHex
      : `#${selectedFilament.colorHex}`
    : null;

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
            {t("catalog.add_spool")}
          </Text>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            testID="close-spool"
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
            {t("form.filament")} *
          </Text>
          <Pressable
            style={[
              styles.pickerBtn,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.surfaceBorder,
              },
            ]}
            onPress={() => setShowFilamentPicker(true)}
            testID="pick-filament"
          >
            <View style={styles.pickerContent}>
              {filamentColor && (
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: filamentColor },
                  ]}
                />
              )}
              <View>
                <Text
                  style={[
                    styles.pickerText,
                    {
                      color: selectedFilament
                        ? colors.text
                        : colors.textTertiary,
                    },
                  ]}
                >
                  {selectedFilament?.name ??
                    t("catalog.select_filament")}
                </Text>
                {selectedMfr && (
                  <Text
                    style={[
                      styles.pickerSubText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {selectedMfr.name} · {selectedFilament?.material}
                  </Text>
                )}
              </View>
            </View>
            <Ionicons
              name="chevron-down"
              size={18}
              color={colors.textTertiary}
            />
          </Pressable>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.initial_weight")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
            ]}
            value={initialWeight}
            onChangeText={setInitialWeight}
            placeholder={String(selectedFilament?.weight ?? 1000)}
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
            testID="input-spool-weight"
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
            placeholder={String(selectedFilament?.spoolWeight ?? 200)}
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
            testID="input-spool-tara"
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
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.display_name")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
            ]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={`${t("form.display_name")} (${t("form.optional")})`}
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.lot")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
            ]}
            value={lotNr}
            onChangeText={setLotNr}
            placeholder={`${t("form.lot")} (${t("form.optional")})`}
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.qr_code")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
            ]}
            value={qrCode}
            onChangeText={setQrCode}
            placeholder={`${t("form.qr_code")} (${t("form.optional")})`}
            placeholderTextColor={colors.textTertiary}
            testID="input-spool-qr"
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
          testID="save-spool"
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
        visible={showFilamentPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilamentPicker(false)}
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
                {t("catalog.select_filament")}
              </Text>
              <Pressable
                onPress={() => setShowFilamentPicker(false)}
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
              data={enrichedFilaments}
              keyExtractor={(item) => item.localId}
              renderItem={({ item }) => {
                const fColor = item.colorHex
                  ? item.colorHex.startsWith("#")
                    ? item.colorHex
                    : `#${item.colorHex}`
                  : null;
                return (
                  <Pressable
                    style={[
                      styles.filamentItem,
                      {
                        backgroundColor:
                          filamentLocalId === item.localId
                            ? `${colors.accent}15`
                            : "transparent",
                      },
                    ]}
                    onPress={() => {
                      setFilamentLocalId(item.localId);
                      setShowFilamentPicker(false);
                      Haptics.selectionAsync();
                    }}
                  >
                    <View style={styles.filamentItemLeft}>
                      {fColor && (
                        <View
                          style={[
                            styles.colorDotSmall,
                            { backgroundColor: fColor },
                          ]}
                        />
                      )}
                      <View>
                        <Text
                          style={[
                            styles.filamentName,
                            {
                              color:
                                filamentLocalId === item.localId
                                  ? colors.accent
                                  : colors.text,
                            },
                          ]}
                        >
                          {item.name}
                        </Text>
                        <Text
                          style={[
                            styles.filamentSub,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {item.manufacturerName
                            ? `${item.manufacturerName} · `
                            : ""}
                          {item.material}
                          {item.weight ? ` · ${item.weight}g` : ""}
                        </Text>
                      </View>
                    </View>
                    {filamentLocalId === item.localId && (
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color={colors.accent}
                      />
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text
                  style={[
                    styles.emptyPicker,
                    { color: colors.textTertiary },
                  ]}
                >
                  {t("catalog.no_filaments")}
                </Text>
              }
              ListFooterComponent={
                <Pressable
                  style={[
                    styles.createNewBtn,
                    { borderColor: colors.accent },
                  ]}
                  onPress={() => {
                    setShowFilamentPicker(false);
                    router.push("/add-filament");
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
              style={styles.pickerListStyle}
              scrollEnabled={enrichedFilaments.length > 5}
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
  pickerBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  pickerText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  pickerSubText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  colorDotSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
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
    maxHeight: "70%",
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
  pickerListStyle: { maxHeight: 350 },
  filamentItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  filamentItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  filamentName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  filamentSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
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
});
