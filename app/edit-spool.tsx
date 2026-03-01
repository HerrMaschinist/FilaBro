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
  Switch,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useApp, useAppTheme } from "@/contexts/AppContext";

export default function EditSpoolScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const { spools, updateSpool, reloadSpoolsLocal } = useApp();

  const spool = spools.find((s) => s._localId === localId);

  const [displayName, setDisplayName] = useState(spool?._displayName ?? "");
  const [comment, setComment] = useState(spool?.comment ?? "");
  const [lotNr, setLotNr] = useState(spool?.lot_nr ?? "");
  const [spoolWeight, setSpoolWeight] = useState(
    spool?.spool_weight !== undefined ? String(spool.spool_weight) : ""
  );
  const [initialWeight, setInitialWeight] = useState(
    spool?.initial_weight !== undefined ? String(spool.initial_weight) : ""
  );
  const [qrCode, setQrCode] = useState(spool?._qrCode ?? "");
  const [nfcTagId, setNfcTagId] = useState(spool?._nfcTagId ?? "");
  const [archived, setArchived] = useState(spool?.archived ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!localId) return;

    const parsedSpoolWeight = spoolWeight ? parseFloat(spoolWeight) : undefined;
    const parsedInitialWeight = initialWeight ? parseFloat(initialWeight) : undefined;

    if (spoolWeight && (isNaN(parsedSpoolWeight!) || parsedSpoolWeight! < 0)) {
      Alert.alert(t("common.error"), t("validation.weight_invalid"));
      return;
    }
    if (initialWeight && (isNaN(parsedInitialWeight!) || parsedInitialWeight! <= 0)) {
      Alert.alert(t("common.error"), t("validation.weight_invalid"));
      return;
    }

    setSaving(true);
    try {
      const patch: {
        displayName?: string;
        comment?: string;
        lotNr?: string;
        spoolWeight?: number;
        initialWeight?: number;
        qrCode?: string;
        nfcTagId?: string;
        archived?: boolean;
      } = {
        displayName: displayName.trim() || undefined,
        comment: comment.trim() || undefined,
        lotNr: lotNr.trim() || undefined,
        spoolWeight: parsedSpoolWeight,
        initialWeight: parsedInitialWeight,
        archived,
      };
      if (qrCode.trim()) patch.qrCode = qrCode.trim();
      if (nfcTagId.trim()) patch.nfcTagId = nfcTagId.trim();

      const ok = await updateSpool(localId, patch);
      if (ok) {
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

  if (!spool) {
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
            {t("catalog.edit_spool")}
          </Text>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            testID="close-edit-spool"
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
            testID="input-spool-displayname"
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
            testID="input-spool-lot"
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
            placeholder="1000"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
            testID="input-spool-initial-weight"
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
            testID="input-spool-spool-weight"
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
            autoCapitalize="none"
            testID="input-spool-qr"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t("form.nfc_tag_id")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
              },
            ]}
            value={nfcTagId}
            onChangeText={setNfcTagId}
            placeholder={`${t("form.nfc_tag_id")} (${t("form.optional")})`}
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            testID="input-spool-nfc"
          />

          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>
              {t("detail.archived")}
            </Text>
            <Switch
              value={archived}
              onValueChange={(val) => {
                setArchived(val);
                Haptics.selectionAsync();
              }}
              trackColor={{
                false: colors.surfaceBorder,
                true: `${colors.accent}80`,
              }}
              thumbColor={archived ? colors.accent : colors.textTertiary}
              testID="toggle-spool-archived"
            />
          </View>
        </View>

        <Pressable
          style={[
            styles.saveBtn,
            {
              backgroundColor: colors.accent,
              opacity: saving ? 0.7 : 1,
            },
          ]}
          onPress={handleSave}
          disabled={saving}
          testID="save-spool-edit"
        >
          <Text style={[styles.saveBtnText, { color: "#fff" }]}>
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
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
