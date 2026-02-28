import { Redirect } from "expo-router";
import { useApp, useAppTheme } from "@/contexts/AppContext";
import { View, ActivityIndicator } from "react-native";

export default function Index() {
  const { isLoading, isOnboarded } = useApp();
  const { colors } = useAppTheme();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!isOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}
