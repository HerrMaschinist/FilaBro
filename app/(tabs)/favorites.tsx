import React, { useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import { SpoolCard } from "@/components/SpoolCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { fontSize, fontWeight } from "@/constants/ui";
import type { Spool } from "@/lib/spoolViewTypes";

export default function FavoritesScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { spools, favorites, toggleFavorite, isFavorite, pendingUpdates } = useApp();

  const favoriteSpools = useMemo<Spool[]>(
    () => spools.filter((s) => favorites.includes(s.id)),
    [spools, favorites]
  );

  const pendingIds = useMemo(
    () => new Set(pendingUpdates.map((u) => u.spoolId)),
    [pendingUpdates]
  );

  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  const s = makeStyles(colors);

  return (
    <View style={[s.container, { paddingTop: topInset }]}>
      <View style={s.headerRow}>
        <Text style={s.title}>{t("favorites.title")}</Text>
        <Text style={[s.count, { color: colors.textSecondary }]}>
          {t("favorites.count", { count: favoriteSpools.length })}
        </Text>
      </View>

      {favoriteSpools.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title={t("favorites.empty_title")}
          message={t("favorites.empty_sub")}
        />
      ) : (
        <FlatList
          data={favoriteSpools}
          keyExtractor={(item) => item._localId ?? String(item.id)}
          renderItem={({ item, index }) => (
            <SpoolCard
              spool={item}
              index={index}
              isFavorite={isFavorite(item.id)}
              onPress={() =>
                router.push({ pathname: "/spool/[id]", params: { id: String(item.id) } })
              }
              onToggleFavorite={() => toggleFavorite(item.id)}
              isPending={pendingIds.has(item.id)}
            />
          )}
          contentContainerStyle={[
            s.list,
            { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function makeStyles(colors: typeof import("@/constants/colors").default.dark) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
    },
    title: {
      fontSize: fontSize.h1,
      fontFamily: fontWeight.bold,
      color: colors.text,
      letterSpacing: -1,
    },
    count: {
      fontSize: fontSize.md,
      fontFamily: fontWeight.regular,
      paddingBottom: 4,
    },
    list: { paddingTop: 4 },
  });
}
