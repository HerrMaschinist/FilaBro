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
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import { SpoolCard } from "@/components/SpoolCard";
import { Spool } from "@/lib/spoolman";

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
        <View style={s.empty}>
          <Ionicons name="heart-outline" size={64} color={colors.textTertiary} />
          <Text style={[s.emptyTitle, { color: colors.text }]}>{t("favorites.empty_title")}</Text>
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>
            {t("favorites.empty_sub")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={favoriteSpools}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <SpoolCard
              spool={item}
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
      fontSize: 32,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      letterSpacing: -1,
    },
    count: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      paddingBottom: 4,
    },
    list: { paddingTop: 4 },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingHorizontal: 40,
    },
    emptyTitle: {
      fontSize: 22,
      fontFamily: "Inter_600SemiBold",
    },
    emptyText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 22,
    },
  });
}
