import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { DarkTheme, LightTheme } from "./Theme";
import { initDB } from "./db/db";
export default function RootLayout() {
  useEffect(() => {
    initDB();
  }, []);
  const scheme = useColorScheme();

  const theme = scheme === "dark" ? DarkTheme : LightTheme;

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.card,
        },
        headerTintColor: theme.text,
        contentStyle: {
          backgroundColor: theme.background,
        },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <StatusBar style="light" />
      <Stack.Screen name="reader/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
