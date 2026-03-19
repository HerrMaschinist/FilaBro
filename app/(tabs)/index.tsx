import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import { SpoolCard } from "@/components/SpoolCard";
import { FAB } from "@/components/ui/FAB";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Spool } from "@/lib/spoolViewTypes";

type SortKey = "name" | "remaining" | "material" | "vendor";
type SortDir = "asc" | "desc";

const MATERIALS = ["PLA", "PETG", "ABS", "TPU", "ASA", "PA", "PC"];

export default function SpoolsScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const {
    spools,
    isSpoolsLoading,
    spoolsError,
    refreshSpools,
    favorites,
    toggleFavorite,
    isFavorite,
    pendingUpdates,
    isOnline,
    connectionStatus,
    lastSync,
    syncPending,
    serverUrl,
    hasMoreSpools,
    isLoadingMoreSpools,
    loadNextPage,
  } = useApp();

  const [search, setSearch] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [filterMaterial, setFilterMaterial] = useState<string | null>(null);
  const [filterFavOnly, setFilterFavOnly] = useState(false);
  const [filterMinWeight, setFilterMinWeight] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (spools.length === 0 && serverUrl) {
      refreshSpools();
    }
  }, []);

  const onRefresh = useCallback(async () => {
    if (!serverUrl) return;
    setRefreshing(true);
    await refreshSpools();
    await syncPending();
    setRefreshing(false);
  }, [refreshSpools, syncPending, serverUrl]);

  const pendingIds = useMemo(
    () => new Set(pendingUpdates.map((u) => u.spoolId)),
    [pendingUpdates]
  );

  const filtered = useMemo<Spool[]>(() => {
    let data = [...spools];
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (s) =>
          s.filament?.name?.toLowerCase().includes(q) ||
          s.filament?.vendor?.name?.toLowerCase().includes(q) ||
          s.filament?.material?.toLowerCase().includes(q) ||
          String(s.id).includes(q)
      );
    }
    if (filterFavOnly) data = data.filter((s) => favorites.includes(s.id));
    if (filterMaterial)
      data = data.filter((s) => s.filament?.material === filterMaterial);
    if (filterMinWeight > 0)
      data = data.filter(
        (s) => (s.remaining_weight ?? 0) >= filterMinWeight
      );

    data.sort((a, b) => {
      let va = "";
      let vb = "";
      if (sortKey === "name") {
        va = a.filament?.name ?? "";
        vb = b.filament?.name ?? "";
      } else if (sortKey === "remaining") {
        const ra = a.remaining_weight ?? 0;
        const rb = b.remaining_weight ?? 0;
        return sortDir === "asc" ? ra - rb : rb - ra;
      } else if (sortKey === "material") {
        va = a.filament?.material ?? "";
        vb = b.filament?.material ?? "";
      } else if (sortKey === "vendor") {
        va = a.filament?.vendor?.name ?? "";
        vb = b.filament?.vendor?.name ?? "";
      }
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return data;
  }, [
    spools,
    search,
    filterFavOnly,
    filterMaterial,
    filterMinWeight,
    sortKey,
    sortDir,
    favorites,
  ]);

  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  const renderItem = useCallback(
    ({ item, index }: { item: Spool; index: number }) => (
      <SpoolCard
        spool={item}
        index={index}
        isFavorite={isFavorite(item.id)}
        onPress={() =>
          router.push({
            pathname: "/spool/[id]",
            params: { id: String(item.id) },
          })
        }
        onToggleFavorite={() => toggleFavorite(item.id)}
        isPending={pendingIds.has(item.id)}
      />
    ),
    [isFavorite, toggleFavorite, pendingIds]
  );

  const syncStr = lastSync
    ? t("home.synced", {
        time: new Date(lastSync).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      })
    : null;

  const showOfflineBadge =
    connectionStatus === "offline" || connectionStatus === "error";
  const showNoServerBadge = connectionStatus === "no_server";

  const s = makeStyles(colors);

  const gradStart = isDark ? "#0B0F1A" : "#F0F4FA";
  const gradEnd   = isDark ? "#0F1425" : "#E8EFF9";

  return (
    <LinearGradient colors={[gradStart, gradEnd]} style={[s.container, { paddingTop: topInset }]}>
      <View style={s.headerRow}>
        <Text style={s.title}>{t("home.title")}</Text>
        <View style={s.headerActions}>
          {showNoServerBadge && (
            <View
              style={[
                s.offlineBadge,
                { backgroundColor: `${colors.textTertiary}15` },
              ]}
            >
              <Ionicons
                name="cloud-offline-outline"
                size={14}
                color={colors.textTertiary}
              />
              <Text
                style={[s.offlineText, { color: colors.textTertiary }]}
              >
                {t("home.no_server")}
              </Text>
            </View>
          )}
          {showOfflineBadge && (
            <View
              style={[
                s.offlineBadge,
                { backgroundColor: `${colors.warning}20` },
              ]}
            >
              <Ionicons
                name="cloud-offline-outline"
                size={14}
                color={colors.warning}
              />
              <Text style={[s.offlineText, { color: colors.warning }]}>
                {t("home.offline")}
              </Text>
            </View>
          )}
          {pendingUpdates.length > 0 && (
            <Pressable
              onPress={() => {
                if (!serverUrl) {
                  Alert.alert(
                    t("home.no_server_title"),
                    t("home.no_server_sub"),
                    [{ text: t("common.ok") }]
                  );
                  return;
                }
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                syncPending();
              }}
              style={[
                s.syncBtn,
                { backgroundColor: `${colors.accent}15` },
              ]}
            >
              <Ionicons
                name="cloud-upload-outline"
                size={16}
                color={colors.accent}
              />
              <Text style={[s.syncBtnText, { color: colors.accent }]}>
                {pendingUpdates.length}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowFilter(true);
            }}
            style={s.iconBtn}
          >
            <Ionicons
              name="options-outline"
              size={22}
              color={colors.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      <View
        style={[
          s.searchRow,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.surfaceBorder,
          },
        ]}
      >
        <Ionicons
          name="search-outline"
          size={18}
          color={colors.textTertiary}
        />
        <TextInput
          style={[s.searchInput, { color: colors.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder={t("home.search_placeholder")}
          placeholderTextColor={colors.textTertiary}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons
              name="close-circle"
              size={18}
              color={colors.textTertiary}
            />
          </Pressable>
        )}
      </View>

      {(syncStr || filtered.length > 0) && (
        <Text style={[s.syncLabel, { color: colors.textTertiary }]}>
          {syncStr ? `${syncStr} · ` : ""}
          {t("home.spools_count", { count: filtered.length })}
        </Text>
      )}

      {connectionStatus === "no_server" &&
        spools.length === 0 &&
        !isSpoolsLoading && (
          <EmptyState
            icon="server-outline"
            title={t("home.no_server_title")}
            message={t("home.no_server_sub")}
            actionLabel={t("home.go_to_settings")}
            onAction={() => router.push("/(tabs)/settings")}
          />
        )}

      {spoolsError &&
        spools.length === 0 &&
        connectionStatus !== "no_server" && (
          <EmptyState
            icon="wifi-outline"
            title={t("home.error_title")}
            message={spoolsError}
            actionLabel={t("home.retry")}
            onAction={refreshSpools}
          />
        )}

      {!spoolsError && spools.length === 0 && isSpoolsLoading && (
        <EmptyState
          title=""
          message={t("home.loading")}
          loading
        />
      )}

      {!spoolsError &&
        spools.length === 0 &&
        !isSpoolsLoading &&
        connectionStatus !== "no_server" && (
          <EmptyState
            icon="layers-outline"
            title={t("home.no_spools_title")}
            message={t("home.no_spools_sub")}
          />
        )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item._localId ?? String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={[
          s.list,
          {
            paddingBottom:
              insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90,
          },
        ]}
        scrollEnabled={!!filtered.length}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        onEndReached={
          hasMoreSpools && !isLoadingMoreSpools && !search.trim()
            ? loadNextPage
            : undefined
        }
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isLoadingMoreSpools ? (
            <ActivityIndicator
              color={colors.accent}
              style={{ marginVertical: 16 }}
            />
          ) : null
        }
        ListEmptyComponent={null}
        showsVerticalScrollIndicator={false}
      />

      <FAB
        onPress={() => setShowAddSheet(true)}
        icon="add"
        testID="fab-add"
      />

      <AddSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        colors={colors}
      />

      <FilterModal
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        colors={colors}
        filterMaterial={filterMaterial}
        setFilterMaterial={setFilterMaterial}
        filterFavOnly={filterFavOnly}
        setFilterFavOnly={setFilterFavOnly}
        filterMinWeight={filterMinWeight}
        setFilterMinWeight={setFilterMinWeight}
        sortKey={sortKey}
        setSortKey={setSortKey}
        sortDir={sortDir}
        setSortDir={setSortDir}
      />
    </LinearGradient>
  );
}

function AddSheet({
  visible,
  onClose,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: typeof import("@/constants/colors").default.dark;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const translateY = useSharedValue(340);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 26, stiffness: 280 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withSpring(340, { damping: 28, stiffness: 300 });
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const options = [
    {
      key: "spool",
      icon: "layers-outline" as const,
      label: t("catalog.new_spool"),
      route: "/add-spool",
    },
    {
      key: "filament",
      icon: "color-fill-outline" as const,
      label: t("catalog.new_filament"),
      route: "/add-filament",
    },
    {
      key: "manufacturer",
      icon: "business-outline" as const,
      label: t("catalog.new_manufacturer"),
      route: "/add-manufacturer",
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={addStyles.modalRoot}>
        <Animated.View style={[addStyles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            addStyles.sheet,
            sheetStyle,
            {
              backgroundColor: colors.surface,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View
            style={[
              addStyles.handle,
              { backgroundColor: colors.surfaceBorder },
            ]}
          />
          <Text style={[addStyles.sheetTitle, { color: colors.text }]}>
            {t("catalog.what_to_add")}
          </Text>

          {options.map((opt) => (
            <Pressable
              key={opt.key}
              style={({ pressed }) => [
                addStyles.option,
                { backgroundColor: colors.surfaceElevated },
                pressed && { opacity: 0.82 },
              ]}
              onPress={() => {
                onClose();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTimeout(() => router.push(opt.route as any), 200);
              }}
              testID={`add-${opt.key}`}
            >
              <View
                style={[
                  addStyles.optionIcon,
                  { backgroundColor: `${colors.accent}15` },
                ]}
              >
                <Ionicons name={opt.icon} size={22} color={colors.accent} />
              </View>
              <Text style={[addStyles.optionText, { color: colors.text }]}>
                {opt.label}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textTertiary}
              />
            </Pressable>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

const addStyles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 16,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    marginBottom: 8,
    gap: 14,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  colors: typeof import("@/constants/colors").default.dark;
  filterMaterial: string | null;
  setFilterMaterial: (m: string | null) => void;
  filterFavOnly: boolean;
  setFilterFavOnly: (v: boolean) => void;
  filterMinWeight: number;
  setFilterMinWeight: (v: number) => void;
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
  sortDir: SortDir;
  setSortDir: (d: SortDir) => void;
}

function FilterModal({
  visible,
  onClose,
  colors,
  filterMaterial,
  setFilterMaterial,
  filterFavOnly,
  setFilterFavOnly,
  filterMinWeight,
  setFilterMinWeight,
  sortKey,
  setSortKey,
  sortDir,
  setSortDir,
}: FilterModalProps) {
  const { t } = useTranslation();
  const s = makeStyles(colors);
  const insets = useSafeAreaInsets();

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "name", label: t("home.sort_name") },
    { key: "remaining", label: t("home.sort_weight") },
    { key: "material", label: t("home.sort_material") },
    { key: "vendor", label: t("home.sort_vendor") },
  ];
  const weightOptions = [0, 50, 100, 200, 500];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.modalOverlay}>
        <View
          style={[
            s.sheet,
            {
              backgroundColor: colors.surface,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View
            style={[
              s.sheetHandle,
              { backgroundColor: colors.surfaceBorder },
            ]}
          />
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>
              {t("home.filter_sort")}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons
                name="close"
                size={24}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
            {t("home.sort_by")}
          </Text>
          <View style={s.chipRow}>
            {sortOptions.map((opt) => (
              <Pressable
                key={opt.key}
                style={[
                  s.chip,
                  {
                    borderColor: colors.surfaceBorder,
                    backgroundColor: colors.surfaceElevated,
                  },
                  sortKey === opt.key && {
                    backgroundColor: `${colors.accent}20`,
                    borderColor: colors.accent,
                  },
                ]}
                onPress={() => {
                  if (sortKey === opt.key) {
                    setSortDir(sortDir === "asc" ? "desc" : "asc");
                  } else {
                    setSortKey(opt.key);
                    setSortDir("asc");
                  }
                  Haptics.selectionAsync();
                }}
              >
                <Text
                  style={[
                    s.chipText,
                    {
                      color:
                        sortKey === opt.key
                          ? colors.accent
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {opt.label}
                </Text>
                {sortKey === opt.key && (
                  <Ionicons
                    name={sortDir === "asc" ? "arrow-up" : "arrow-down"}
                    size={12}
                    color={colors.accent}
                  />
                )}
              </Pressable>
            ))}
          </View>

          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
            {t("home.material")}
          </Text>
          <View style={s.chipRow}>
            <Pressable
              style={[
                s.chip,
                {
                  borderColor: colors.surfaceBorder,
                  backgroundColor: colors.surfaceElevated,
                },
                !filterMaterial && {
                  backgroundColor: `${colors.accent}20`,
                  borderColor: colors.accent,
                },
              ]}
              onPress={() => {
                setFilterMaterial(null);
                Haptics.selectionAsync();
              }}
            >
              <Text
                style={[
                  s.chipText,
                  {
                    color: !filterMaterial
                      ? colors.accent
                      : colors.textSecondary,
                  },
                ]}
              >
                {t("home.all")}
              </Text>
            </Pressable>
            {MATERIALS.map((m) => (
              <Pressable
                key={m}
                style={[
                  s.chip,
                  {
                    borderColor: colors.surfaceBorder,
                    backgroundColor: colors.surfaceElevated,
                  },
                  filterMaterial === m && {
                    backgroundColor: `${colors.accent}20`,
                    borderColor: colors.accent,
                  },
                ]}
                onPress={() => {
                  setFilterMaterial(m);
                  Haptics.selectionAsync();
                }}
              >
                <Text
                  style={[
                    s.chipText,
                    {
                      color:
                        filterMaterial === m
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

          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
            {t("home.min_remaining")}
          </Text>
          <View style={s.chipRow}>
            {weightOptions.map((w) => (
              <Pressable
                key={w}
                style={[
                  s.chip,
                  {
                    borderColor: colors.surfaceBorder,
                    backgroundColor: colors.surfaceElevated,
                  },
                  filterMinWeight === w && {
                    backgroundColor: `${colors.accent}20`,
                    borderColor: colors.accent,
                  },
                ]}
                onPress={() => {
                  setFilterMinWeight(w);
                  Haptics.selectionAsync();
                }}
              >
                <Text
                  style={[
                    s.chipText,
                    {
                      color:
                        filterMinWeight === w
                          ? colors.accent
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {w === 0 ? t("home.any") : `${w}g`}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={s.toggleRow}>
            <Text style={[s.toggleLabel, { color: colors.text }]}>
              {t("home.favorites_only")}
            </Text>
            <Pressable
              style={[
                s.toggle,
                {
                  backgroundColor: filterFavOnly
                    ? colors.accent
                    : colors.surfaceElevated,
                },
              ]}
              onPress={() => {
                setFilterFavOnly(!filterFavOnly);
                Haptics.selectionAsync();
              }}
            >
              <View
                style={[s.toggleKnob, filterFavOnly && s.toggleKnobOn]}
              />
            </Pressable>
          </View>

          <Pressable
            style={[s.applyBtn, { backgroundColor: colors.accent }]}
            onPress={onClose}
          >
            <Text style={s.applyBtnText}>{t("home.apply")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: typeof import("@/constants/colors").default.dark) {
  return StyleSheet.create({
    container: { flex: 1 },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },
    title: {
      fontSize: 32,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      letterSpacing: -1,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    offlineBadge: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      gap: 4,
    },
    offlineText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
    },
    syncBtn: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      gap: 4,
    },
    syncBtnText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
    },
    iconBtn: { padding: 6 },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      marginBottom: 4,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      padding: 0,
    },
    syncLabel: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      paddingHorizontal: 20,
      paddingBottom: 4,
    },
    list: { paddingTop: 4 },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    sheet: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 12,
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
      marginBottom: 20,
    },
    sheetTitle: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
      gap: 4,
    },
    chipText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    toggleLabel: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
    },
    toggle: {
      width: 48,
      height: 28,
      borderRadius: 14,
      padding: 3,
    },
    toggleKnob: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "#fff",
    },
    toggleKnobOn: { marginLeft: 20 },
    applyBtn: {
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
    },
    applyBtnText: {
      color: "#000",
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
    },
  });
}
