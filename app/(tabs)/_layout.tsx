import { Tabs } from "expo-router";
import { Platform, Text, View } from "react-native";

function TabIcon({
  emoji,
  label,
  focused,
}: {
  emoji: string;
  label: string;
  focused: boolean;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        paddingVertical: 4,
        borderRadius: 40,
        backgroundColor: focused ? "#f59e0b20" : "transparent",
        minWidth: 90,
        minHeight: 50,
      }}
    >
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
      <Text
        style={{
          fontSize: 10,
          fontWeight: focused ? "600" : "400",
          color: focused ? "#f59e0b" : "#52525b",
          marginTop: 3,
          marginBottom: 3,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
      {focused && (
        <View
          style={{
            position: "absolute",
            bottom: -10,
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: "#f59e0b",
          }}
        />
      )}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0a0a0a",
          borderTopWidth: 1,
          borderTopColor: "#1f1f1f",
          height: Platform.OS === "android" ? 64 : 92,
          paddingBottom: Platform.OS === "android" ? 16 : 24,
          paddingTop: 10,
          elevation: 0,
        },
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📚" label="Library" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🔍" label="Search" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📊" label="Stats" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
