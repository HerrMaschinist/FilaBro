import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import { fontSize, fontWeight } from "@/constants/ui";
import type { PrinterProfileData } from "@/src/data/repositories/PrinterRepository";

const NOZZLE_SIZES = ["0.2", "0.4", "0.6", "1.0"];
const MATERIALS = ["PLA", "PETG", "ABS", "TPU", "ASA"];

export default function PrinterProfilesScreen() {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { printerProfiles, createPrinterProfile, updatePrinterProfile, deletePrinterProfile } = useApp();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [nozzle, setNozzle] = useState<string | null>(null);
  const [nozzleTemp, setNozzleTemp] = useState("");
  const [bedTemp, setBedTemp] = useState("");
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);

  const resetForm = () => {
    setName("");
    setNozzle(null);
    setNozzleTemp("");
    setBedTemp("");
    setSelectedMaterials([]);
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEdit = (profile: typeof printerProfiles[0]) => {
    setEditingId(profile.localId);
    setName(profile.name);
    setNozzle(profile.nozzleDiameter?.toString() ?? null);
    setNozzleTemp(profile.nozzleTemp?.toString() ?? "");
    setBedTemp(profile.bedTemp?.toString() ?? "");
    setSelectedMaterials(
      profile.compatibleMaterials ? profile.compatibleMaterials.split(",").map((s) => s.trim()).filter(Boolean) : []
    );
    setModalVisible(true);
  };

  const toggleMaterial = (mat: string) => {
    setSelectedMaterials((prev) =>
      prev.includes(mat) ? prev.filter((m) => m !== mat) : [...prev, mat]
    );
  };

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Fehler", "Name ist erforderlich.");
      return;
    }
    const data: PrinterProfileData = {
      name: name.trim(),
      nozzleDiameter: nozzle ? parseFloat(nozzle) : undefined,
      nozzleTemp: nozzleTemp ? parseInt(nozzleTemp, 10) : undefined,
      bedTemp: bedTemp ? parseInt(bedTemp, 10) : undefined,
      compatibleMaterials: selectedMaterials.length > 0 ? selectedMaterials.join(", ") : undefined,
    };
    if (editingId) {
      await updatePrinterProfile(editingId, data);
    } else {
      await createPrinterProfile(data);
    }
    setModalVisible(false);
    resetForm();
  }, [name, nozzle, nozzleTemp, bedTemp, selectedMaterials, editingId, createPrinterProfile, updatePrinterProfile]);

  const handleDelete = useCallback((localId: string, profileName: string) => {
    Alert.alert(
      "Drucker löschen",
      `"${profileName}" wirklich löschen?`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: () => deletePrinterProfile(localId),
        },
      ]
    );
  }, [deletePrinterProfile]);

  const gradStart = isDark ? "#0B0F1A" : "#F0F4FA";
  const gradEnd   = isDark ? "#0F1425" : "#E8EFF9";
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  const s = makeStyles(colors);

  return (
    <LinearGradient colors={[gradStart, gradEnd]} style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingTop: topInset }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.headerRow}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.accent} />
          </Pressable>
          <Text style={[s.pageTitle, { color: colors.text }]}>Druckerprofile</Text>
          <Pressable onPress={openAdd} style={[s.addBtn, { backgroundColor: colors.accent }]}>
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        </View>

        {printerProfiles.length === 0 ? (
          <View style={[s.emptyCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <Ionicons name="print-outline" size={40} color={colors.textTertiary} />
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>
              Noch keine Druckerprofile angelegt.
            </Text>
            <Pressable onPress={openAdd} style={[s.emptyBtn, { borderColor: colors.accent }]}>
              <Text style={[s.emptyBtnLabel, { color: colors.accent }]}>Drucker hinzufügen</Text>
            </Pressable>
          </View>
        ) : (
          printerProfiles.map((profile) => (
            <Pressable
              key={profile.localId}
              style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
              onLongPress={() => handleDelete(profile.localId, profile.name)}
              onPress={() => openEdit(profile)}
            >
              <View style={s.cardHeader}>
                <Ionicons name="print-outline" size={18} color={colors.accent} />
                <Text style={[s.cardName, { color: colors.text }]}>{profile.name}</Text>
                <Pressable onPress={() => handleDelete(profile.localId, profile.name)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                </Pressable>
              </View>
              <View style={s.cardMeta}>
                {profile.nozzleDiameter != null && (
                  <View style={[s.chip, { backgroundColor: colors.surfaceElevated }]}>
                    <Text style={[s.chipLabel, { color: colors.textSecondary }]}>
                      ⌀ {profile.nozzleDiameter} mm
                    </Text>
                  </View>
                )}
                {profile.nozzleTemp != null && (
                  <View style={[s.chip, { backgroundColor: colors.surfaceElevated }]}>
                    <Text style={[s.chipLabel, { color: colors.textSecondary }]}>
                      {profile.nozzleTemp}°C Drucktemp
                    </Text>
                  </View>
                )}
                {profile.bedTemp != null && (
                  <View style={[s.chip, { backgroundColor: colors.surfaceElevated }]}>
                    <Text style={[s.chipLabel, { color: colors.textSecondary }]}>
                      {profile.bedTemp}°C Bett
                    </Text>
                  </View>
                )}
                {profile.compatibleMaterials && (
                  <View style={[s.chip, { backgroundColor: colors.surfaceElevated }]}>
                    <Text style={[s.chipLabel, { color: colors.textSecondary }]}>
                      {profile.compatibleMaterials}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          ))
        )}

        <View style={{ height: insets.bottom + 100 }} />
      </ScrollView>

      {/* Add / Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <Pressable
          style={s.modalOverlay}
          onPress={() => { setModalVisible(false); resetForm(); }}
        >
          <Pressable style={[s.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={[s.sheetHandle, { backgroundColor: colors.surfaceBorder }]} />

            <Text style={[s.sheetTitle, { color: colors.text }]}>
              {editingId ? "Drucker bearbeiten" : "Neuer Drucker"}
            </Text>

            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Name *</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.surfaceElevated, color: colors.text, borderColor: colors.surfaceBorder }]}
              value={name}
              onChangeText={setName}
              placeholder="z.B. Bambu X1C"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Düsendurchmesser (mm)</Text>
            <View style={s.chipRow}>
              {NOZZLE_SIZES.map((size) => (
                <Pressable
                  key={size}
                  style={[
                    s.chip,
                    { borderColor: colors.surfaceBorder, borderWidth: 1, backgroundColor: colors.surfaceElevated },
                    nozzle === size && { backgroundColor: colors.accent, borderColor: colors.accent },
                  ]}
                  onPress={() => setNozzle(nozzle === size ? null : size)}
                >
                  <Text style={[s.chipLabel, { color: nozzle === size ? "#fff" : colors.text }]}>
                    {size}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={s.twoCol}>
              <View style={s.colHalf}>
                <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Drucktemp (°C)</Text>
                <TextInput
                  style={[s.input, { backgroundColor: colors.surfaceElevated, color: colors.text, borderColor: colors.surfaceBorder }]}
                  value={nozzleTemp}
                  onChangeText={setNozzleTemp}
                  keyboardType="number-pad"
                  placeholder="210"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
              <View style={s.colHalf}>
                <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Betttemp (°C)</Text>
                <TextInput
                  style={[s.input, { backgroundColor: colors.surfaceElevated, color: colors.text, borderColor: colors.surfaceBorder }]}
                  value={bedTemp}
                  onChangeText={setBedTemp}
                  keyboardType="number-pad"
                  placeholder="60"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            </View>

            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Kompatible Materialien</Text>
            <View style={s.chipRow}>
              {MATERIALS.map((mat) => (
                <Pressable
                  key={mat}
                  style={[
                    s.chip,
                    { borderColor: colors.surfaceBorder, borderWidth: 1, backgroundColor: colors.surfaceElevated },
                    selectedMaterials.includes(mat) && { backgroundColor: colors.accent, borderColor: colors.accent },
                  ]}
                  onPress={() => toggleMaterial(mat)}
                >
                  <Text style={[s.chipLabel, { color: selectedMaterials.includes(mat) ? "#fff" : colors.text }]}>
                    {mat}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={s.sheetBtnRow}>
              <Pressable
                style={[s.sheetBtn, s.sheetBtnCancel, { borderColor: colors.surfaceBorder }]}
                onPress={() => { setModalVisible(false); resetForm(); }}
              >
                <Text style={[s.sheetBtnLabel, { color: colors.textSecondary }]}>Abbrechen</Text>
              </Pressable>
              <Pressable
                style={[s.sheetBtn, s.sheetBtnSave, { backgroundColor: colors.accent }]}
                onPress={handleSave}
              >
                <Text style={[s.sheetBtnLabel, { color: "#fff" }]}>Speichern</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

function makeStyles(colors: typeof import("@/constants/colors").default.dark) {
  return StyleSheet.create({
    container: { flex: 1 },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 24,
      paddingTop: 16,
      gap: 12,
    },
    backBtn: { padding: 4 },
    pageTitle: {
      flex: 1,
      fontSize: fontSize.h1,
      fontFamily: fontWeight.bold,
      letterSpacing: -0.5,
    },
    addBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 32,
      alignItems: "center",
      gap: 12,
    },
    emptyText: { fontSize: fontSize.base, fontFamily: fontWeight.regular, textAlign: "center" },
    emptyBtn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, marginTop: 4 },
    emptyBtnLabel: { fontSize: fontSize.md, fontFamily: fontWeight.semibold },
    card: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      marginBottom: 12,
      gap: 8,
    },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    cardName: { flex: 1, fontSize: fontSize.md, fontFamily: fontWeight.semibold },
    cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
    chipLabel: { fontSize: fontSize.xs, fontFamily: fontWeight.medium },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    sheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 24,
      paddingBottom: 40,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: 16,
    },
    sheetTitle: { fontSize: fontSize.lg, fontFamily: fontWeight.bold, marginBottom: 16 },
    fieldLabel: { fontSize: fontSize.base, fontFamily: fontWeight.medium, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: fontSize.base,
      fontFamily: fontWeight.regular,
      marginBottom: 12,
    },
    twoCol: { flexDirection: "row", gap: 12 },
    colHalf: { flex: 1 },
    sheetBtnRow: { flexDirection: "row", gap: 12, marginTop: 8 },
    sheetBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
    sheetBtnCancel: { borderWidth: 1 },
    sheetBtnSave: {},
    sheetBtnLabel: { fontSize: fontSize.md, fontFamily: fontWeight.semibold },
  });
}
