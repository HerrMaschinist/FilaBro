import { Redirect } from "expo-router";
import { useApp } from "@/contexts/AppContext";
import { View, ActivityIndicator, useColorScheme } from "react-native";
import Colors from "@/constants/colors";

export default function Index() {
  const { isLoading, isOnboarded } = useApp();
  const colorScheme = useColorScheme();
  const colors = colorScheme === "dark" ? Colors.dark : Colors.light;

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!isOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}
