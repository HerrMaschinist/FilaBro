import React, { useState } from "react";
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
import { CatalogRepository } from "@/src/data/repositories/CatalogRepository";
import { isCatalogReady } from "@/src/data/db/catalog_client";
import { FilabaseRepository } from "@/src/data/repositories/FilabaseRepository";
import { isFilabaseReady } from "@/src/data/db/filabase_client";

export default function AddManufacturerScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { createManufacturer } = useApp();

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const [showCatalogSearch, setShowCatalogSearch] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<string[]>([]);

  const canSave = name.trim().length > 0;

  const handleCatalogSearch = (query: string) => {
    setCatalogQuery(query);
    if (query.trim().length < 2) {
      setCatalogResults([]);
      return;
    }
    const results: string[] = [];
    if (isFilabaseReady()) {
      const fb = FilabaseRepository.searchByName(query);
      fb.forEach((e) => {
        if (!results.includes(e.brandName)) results.push(e.brandName);
      });
    }
    if (isCatalogReady()) {
      const ofd = CatalogRepository.getBrands();
      ofd
        .filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
        .forEach((b) => {
          if (!results.includes(b.name)) results.push(b.name);
        });
    }
    setCatalogResults(results.slice(0, 20));
  };

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert(t("common.error"), t("validation.name_required"));
      return;
    }
    setSaving(true);
    try {
      const result = await createManufacturer({
        name: name.trim(),
        website: website.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      if (result) {
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
            {t("catalog.add_manufacturer")}
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={12} testID="close-manufacturer">
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Katalog-Suche Button */}
        <Pressable
          onPress={() => setShowCatalogSearch(true)}
          style={[
            styles.catalogBtn,
            { backgroundColor: `${colors.accent}15`, borderColor: `${colors.accent}30` },
          ]}
        >
          <Ionicons name="search-outline" size={16} color={colors.accent} />
          <Text style={[styles.catalogBtnText, { color: colors.accent }]}>
            Aus Katalog suchen
          </Text>
        </Pressable>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          ]}
        >
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.name")} *
          </Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.surfaceElevated, color: colors.text },
            ]}
            value={name}
            onChangeText={setName}
            placeholder={t("form.name")}
            placeholderTextColor={colors.textTertiary}
            autoFocus
            testID="input-manufacturer-name"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.website")}
          </Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.surfaceElevated, color: colors.text },
            ]}
            value={website}
            onChangeText={setWebsite}
            placeholder={`${t("form.website")} (${t("form.optional")})`}
            placeholderTextColor={colors.textTertiary}
            keyboardType="url"
            autoCapitalize="none"
            testID="input-manufacturer-website"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.comment")}
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.multiline,
              { backgroundColor: colors.surfaceElevated, color: colors.text },
            ]}
            value={comment}
            onChangeText={setComment}
            placeholder={`${t("form.comment")} (${t("form.optional")})`}
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
            testID="input-manufacturer-comment"
          />
        </View>

        <Pressable
          style={[
            styles.saveBtn,
            {
              backgroundColor: canSave ? colors.accent : colors.surfaceElevated,
              opacity: saving ? 0.7 : 1,
            },
          ]}
          onPress={handleSave}
          disabled={!canSave || saving}
          testID="save-manufacturer"
        >
          <Text style={[styles.saveBtnText, { color: canSave ? "#fff" : colors.textTertiary }]}>
            {t("common.save")}
          </Text>
        </Pressable>
      </ScrollView>

      {/* Such-Modal */}
      <Modal
        visible={showCatalogSearch}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCatalogSearch(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.surfaceBorder }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Hersteller suchen</Text>
            <View
              style={[
                styles.searchRow,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.surfaceBorder },
              ]}
            >
              <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                value={catalogQuery}
                onChangeText={handleCatalogSearch}
                placeholder="Hersteller suchen..."
                placeholderTextColor={colors.textTertiary}
                autoFocus
              />
            </View>
            <FlatList
              data={catalogResults}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.resultItem, { borderBottomColor: colors.surfaceBorder }]}
                  onPress={() => {
                    setName(item);
                    setShowCatalogSearch(false);
                    setCatalogQuery("");
                    setCatalogResults([]);
                  }}
                >
                  <Ionicons name="business-outline" size={18} color={colors.textSecondary} />
                  <Text style={[styles.resultText, { color: colors.text }]}>{item}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              )}
              ListEmptyComponent={
                catalogQuery.length >= 2 ? (
                  <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                    Keine Treffer
                  </Text>
                ) : null
              }
            />
            <Pressable
              onPress={() => setShowCatalogSearch(false)}
              style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]}
            >
              <Text
                style={{ color: colors.textSecondary, fontSize: 15, fontFamily: "Inter_500Medium" }}
              >
                {t("common.close") ?? "Schlie\u00dfen"}
              </Text>
            </Pressable>
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
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  catalogBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  catalogBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
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
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "80%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 12 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", padding: 0 },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  resultText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  emptyText: {
    textAlign: "center",
    paddingVertical: 32,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  closeBtn: { marginTop: 12, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
});
