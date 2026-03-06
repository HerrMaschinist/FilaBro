import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import type { Manufacturer, Filament as DomainFilament } from "@/src/domain/models";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function filamentColor(f: DomainFilament): string | null {
  const hex = f.colorHexNormalized ?? f.colorHex;
  if (!hex) return null;
  return hex.startsWith("#") ? hex : `#${hex}`;
}

// ─── Filament row ─────────────────────────────────────────────────────────────

function FilamentRow({
  item,
  manufacturerName,
  colors,
  onPress,
  onDelete,
}: {
  item: DomainFilament;
  manufacturerName?: string;
  colors: ReturnType<typeof useAppTheme>["colors"];
  onPress: () => void;
  onDelete: () => void;
}) {
  const dotColor = filamentColor(item);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        pressed && { opacity: 0.78 },
      ]}
      onPress={onPress}
      testID={`filament-row-${item.localId}`}
    >
      <View style={styles.rowLeft}>
        <View
          style={[
            styles.colorDot,
            {
              backgroundColor: dotColor ?? colors.surfaceElevated,
              borderWidth: dotColor ? 0 : 1,
              borderColor: colors.surfaceBorder,
            },
          ]}
        />
        <View style={styles.rowTexts}>
          <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {[manufacturerName, item.material, item.weight ? `${item.weight} g` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>

      <View style={styles.rowActions}>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        <Pressable
          hitSlop={12}
          onPress={onDelete}
          testID={`delete-filament-${item.localId}`}
        >
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Manufacturer row ─────────────────────────────────────────────────────────

function ManufacturerRow({
  item,
  filamentCount,
  colors,
  onPress,
  onDelete,
}: {
  item: Manufacturer;
  filamentCount: number;
  colors: ReturnType<typeof useAppTheme>["colors"];
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        pressed && { opacity: 0.78 },
      ]}
      onPress={onPress}
      testID={`manufacturer-row-${item.localId}`}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.mfrIcon, { backgroundColor: `${colors.accent}18` }]}>
          <Ionicons name="business-outline" size={18} color={colors.accent} />
        </View>
        <View style={styles.rowTexts}>
          <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {filamentCount > 0 ? `${filamentCount} filament${filamentCount !== 1 ? "s" : ""}` : item.website ?? ""}
          </Text>
        </View>
      </View>

      <View style={styles.rowActions}>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        <Pressable
          hitSlop={12}
          onPress={onDelete}
          testID={`delete-manufacturer-${item.localId}`}
        >
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  onAdd,
  colors,
}: {
  title: string;
  count: number;
  onAdd: () => void;
  colors: ReturnType<typeof useAppTheme>["colors"];
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
        {title.toUpperCase()}
        <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>
          {"  "}
          {count}
        </Text>
      </Text>
      <Pressable
        onPress={onAdd}
        hitSlop={12}
        style={[styles.addBtn, { backgroundColor: `${colors.accent}18` }]}
        testID={`add-${title.toLowerCase()}`}
      >
        <Ionicons name="add" size={18} color={colors.accent} />
      </Pressable>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CatalogScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const {
    manufacturers,
    filaments,
    deleteManufacturer,
    deleteFilament,
    persistenceEnabled,
  } = useApp();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90;

  const filamentsByMfr = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of filaments) {
      if (f.manufacturerLocalId) {
        map[f.manufacturerLocalId] = (map[f.manufacturerLocalId] ?? 0) + 1;
      }
    }
    return map;
  }, [filaments]);

  const enrichedFilaments = useMemo(
    () =>
      filaments.map((f) => ({
        ...f,
        manufacturerName: f.manufacturerLocalId
          ? manufacturers.find((m) => m.localId === f.manufacturerLocalId)?.name
          : undefined,
      })),
    [filaments, manufacturers]
  );

  const handleDeleteFilament = (localId: string, name: string) => {
    Alert.alert(
      t("catalog.confirm_delete"),
      `${t("catalog.confirm_delete_msg")}\n\n"${name}"`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            setDeletingId(localId);
            await deleteFilament(localId);
            setDeletingId(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const handleDeleteManufacturer = (localId: string, name: string) => {
    const linkedCount = filamentsByMfr[localId] ?? 0;
    const msg = linkedCount > 0
      ? `${t("catalog.confirm_delete_msg")}\n\n"${name}"\n\n${linkedCount} linked filament${linkedCount !== 1 ? "s" : ""} will lose their manufacturer.`
      : `${t("catalog.confirm_delete_msg")}\n\n"${name}"`;

    Alert.alert(t("catalog.confirm_delete"), msg, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          setDeletingId(localId);
          await deleteManufacturer(localId);
          setDeletingId(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  type ListItem =
    | { type: "section_fil" }
    | { type: "filament"; data: typeof enrichedFilaments[number] }
    | { type: "fil_empty" }
    | { type: "section_mfr" }
    | { type: "manufacturer"; data: Manufacturer }
    | { type: "mfr_empty" };

  const listData: ListItem[] = [
    { type: "section_fil" },
    ...(enrichedFilaments.length > 0
      ? enrichedFilaments.map((f) => ({ type: "filament" as const, data: f }))
      : [{ type: "fil_empty" as const }]),
    { type: "section_mfr" },
    ...(manufacturers.length > 0
      ? manufacturers.map((m) => ({ type: "manufacturer" as const, data: m }))
      : [{ type: "mfr_empty" as const }]),
  ];

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "section_fil") {
      return (
        <SectionHeader
          title={t("catalog.section_filaments")}
          count={enrichedFilaments.length}
          onAdd={() => {
            if (!persistenceEnabled) {
              Alert.alert(t("common.error"), t("catalog.persistence_required"));
              return;
            }
            router.push("/add-filament");
          }}
          colors={colors}
        />
      );
    }

    if (item.type === "fil_empty") {
      return (
        <View style={[styles.emptyRow, { borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            {t("catalog.no_filaments_hint")}
          </Text>
        </View>
      );
    }

    if (item.type === "filament") {
      const f = item.data;
      return (
        <FilamentRow
          item={f}
          manufacturerName={f.manufacturerName}
          colors={colors}
          onPress={() => router.push({ pathname: "/edit-filament", params: { localId: f.localId } })}
          onDelete={() => handleDeleteFilament(f.localId, f.name)}
        />
      );
    }

    if (item.type === "section_mfr") {
      return (
        <SectionHeader
          title={t("catalog.section_manufacturers")}
          count={manufacturers.length}
          onAdd={() => {
            if (!persistenceEnabled) {
              Alert.alert(t("common.error"), t("catalog.persistence_required"));
              return;
            }
            router.push("/add-manufacturer");
          }}
          colors={colors}
        />
      );
    }

    if (item.type === "mfr_empty") {
      return (
        <View style={[styles.emptyRow, { borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            {t("catalog.no_manufacturers_hint")}
          </Text>
        </View>
      );
    }

    if (item.type === "manufacturer") {
      const m = item.data;
      return (
        <ManufacturerRow
          item={m}
          filamentCount={filamentsByMfr[m.localId] ?? 0}
          colors={colors}
          onPress={() =>
            router.push({ pathname: "/edit-manufacturer", params: { localId: m.localId } })
          }
          onDelete={() => handleDeleteManufacturer(m.localId, m.name)}
        />
      );
    }

    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={listData}
        keyExtractor={(item, index) => {
          if (item.type === "filament") return `fil-${item.data.localId}`;
          if (item.type === "manufacturer") return `mfr-${item.data.localId}`;
          return `${item.type}-${index}`;
        }}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingTop: topPad + 8,
          paddingBottom: bottomPad,
          paddingHorizontal: 16,
          gap: 4,
        }}
        ListHeaderComponent={
          <Text style={[styles.screenTitle, { color: colors.text }]}>
            {t("catalog.library_title")}
          </Text>
        }
        showsVerticalScrollIndicator={false}
        testID="catalog-list"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenTitle: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
    marginBottom: 20,
    paddingTop: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  sectionCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    flexShrink: 0,
  },
  mfrIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  rowSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  emptyRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
