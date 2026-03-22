import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import { useAppTheme } from "@/contexts/AppContext";
import { usePro } from "@/src/contexts/ProContext";
import { PurchaseService } from "@/src/services/PurchaseService";

const FEATURES: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string }[] = [
  { icon: "scan-outline", label: "Identity Resolver \u2014 KI-Spulenerkennung" },
  { icon: "wifi-outline", label: "NFC-Powerfunktionen" },
  { icon: "color-palette-outline", label: "Farberkennung per Kamera" },
  { icon: "trending-up-outline", label: "Verbrauchsprognose" },
  { icon: "calculator-outline", label: "GCode-Reichweiten-Rechner" },
  { icon: "location-outline", label: "Lagerort-Tracking" },
];

export default function PaywallScreen() {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { isPro, refresh } = usePro();

  const [loading, setLoading] = useState(false);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    PurchaseService.getOfferings().then((o) => setOffering(o));
  }, []);

  const lifetimePkg: PurchasesPackage | null =
    offering?.availablePackages.find(
      (p) =>
        p.packageType === "LIFETIME" ||
        p.identifier.toLowerCase().includes("lifetime")
    ) ?? null;

  const priceString = lifetimePkg?.product.priceString ?? "25,00 \u20ac";

  const handlePurchase = async () => {
    if (!lifetimePkg) {
      setError("Kein Angebot verf\u00fcgbar. Bitte versuche es sp\u00e4ter.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const success = await PurchaseService.purchaseLifetime(lifetimePkg);
      if (success) {
        await refresh();
        router.back();
      } else {
        setError("Kauf wurde abgebrochen.");
      }
    } catch {
      setError("Kauf fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    setError(null);
    try {
      const success = await PurchaseService.restorePurchases();
      if (success) {
        await refresh();
        router.back();
      } else {
        setError("Kein aktiver Kauf gefunden.");
      }
    } catch {
      setError("Wiederherstellung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  const gradStart = isDark ? "#0B0F1A" : "#F0F4FA";
  const gradEnd = isDark ? "#0F1425" : "#E8EFF9";

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[gradStart, gradEnd]} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            s.container,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Schlie\u00dfen-Button */}
          <Pressable
            onPress={() => router.back()}
            style={[s.closeBtn, { backgroundColor: colors.surfaceElevated }]}
            hitSlop={12}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>

          {/* Icon + Glow */}
          <View style={s.iconSection}>
            <LinearGradient
              colors={[`${colors.accent}30`, `${colors.accent}00`]}
              style={s.iconGlow}
            />
            <Ionicons name="shield-checkmark-outline" size={72} color={colors.accent} />
          </View>

          {/* Titel */}
          <Text style={[s.title, { color: colors.text }]}>FilaBro Pro</Text>
          <Text style={[s.subtitle, { color: colors.textSecondary }]}>
            Einmalig kaufen. F\u00fcr immer nutzen.
          </Text>

          {/* Feature-Liste */}
          <View style={[s.featuresCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            {FEATURES.map((f) => (
              <View key={f.label} style={s.featureRow}>
                <View style={[s.featureIcon, { backgroundColor: `${colors.accent}18` }]}>
                  <Ionicons name={f.icon} size={16} color={colors.accent} />
                </View>
                <Text style={[s.featureLabel, { color: colors.text }]}>{f.label}</Text>
              </View>
            ))}
          </View>

          {/* Preis-Card */}
          <View style={[s.priceCard, { backgroundColor: colors.surface, borderColor: `${colors.accent}44` }]}>
            <View style={[s.badge, { backgroundColor: colors.accent }]}>
              <Text style={s.badgeLabel}>7 Tage kostenlos testen</Text>
            </View>
            <Text style={[s.price, { color: colors.text }]}>{priceString}</Text>
            <Text style={[s.priceSub, { color: colors.textTertiary }]}>
              Einmaliger Kauf \u00b7 Kein Abo
            </Text>
          </View>

          {/* Fehler */}
          {error && (
            <Text style={[s.errorText, { color: colors.error }]}>{error}</Text>
          )}

          {/* CTA */}
          {isPro ? (
            <View style={[s.proActiveBanner, { backgroundColor: `${colors.success}18`, borderColor: `${colors.success}44` }]}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <Text style={[s.proActiveLabel, { color: colors.success }]}>
                Du bist bereits Pro \u2713
              </Text>
            </View>
          ) : (
            <>
              <Pressable
                style={({ pressed }) => [
                  s.buyBtn,
                  { backgroundColor: loading ? colors.textTertiary : colors.accent },
                  pressed && !loading && { opacity: 0.85 },
                ]}
                onPress={handlePurchase}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={s.buyBtnLabel}>Jetzt kaufen</Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  s.restoreBtn,
                  { borderColor: colors.surfaceBorder },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={handleRestore}
                disabled={loading}
              >
                <Text style={[s.restoreBtnLabel, { color: colors.textTertiary }]}>
                  Kauf wiederherstellen
                </Text>
              </Pressable>
            </>
          )}

          {/* Fu\u00dfnote */}
          <Text style={[s.footnote, { color: colors.textTertiary }]}>
            Zahlung \u00fcber Google Play. Keine versteckten Kosten.
          </Text>
        </ScrollView>
      </LinearGradient>
    </>
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    gap: 16,
    alignItems: "stretch",
  },
  closeBtn: {
    alignSelf: "flex-end",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconSection: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  iconGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -50,
    alignSelf: "center",
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  featuresCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  priceCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    alignItems: "center",
    gap: 6,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 4,
  },
  badgeLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#000",
  },
  price: {
    fontSize: 40,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
  },
  priceSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  proActiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  proActiveLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  buyBtn: {
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  buyBtnLabel: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#000",
  },
  restoreBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  restoreBtnLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  footnote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
});
