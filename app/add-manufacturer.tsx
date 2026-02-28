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
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useApp, useAppTheme } from "@/contexts/AppContext";

export default function AddManufacturerScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { createManufacturer } = useApp();

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0;

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
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            testID="close-manufacturer"
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
            autoFocus
            testID="input-manufacturer-name"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.website")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
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
            testID="input-manufacturer-comment"
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
          testID="save-manufacturer"
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
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
