import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import Colors from "@/constants/colors";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "sparkles", selected: "sparkles" }} />
        <Label>Today</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule">
        <Icon sf={{ default: "calendar.day.timeline.left", selected: "calendar.day.timeline.left" }} />
        <Label>Schedule</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <Icon sf={{ default: "clock.arrow.circlepath", selected: "clock.arrow.circlepath" }} />
        <Label>History</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.palette.blue,
        tabBarInactiveTintColor: Colors.theme.textMuted,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.select({
            ios: "transparent",
            android: Colors.theme.bg1,
          }),
          borderTopColor: Colors.theme.border,
          borderTopWidth: 1,
          height: Platform.OS === "web" ? 84 : 84,
          paddingBottom: Platform.OS === "web" ? 34 : 0,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: "DMSans_500Medium",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color, size }) =>
            Platform.OS === "ios" ? (
              <SymbolView name="sparkles" tintColor={color} size={size} />
            ) : (
              <Feather name="zap" size={size} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ color, size }) =>
            Platform.OS === "ios" ? (
              <SymbolView name="calendar" tintColor={color} size={size} />
            ) : (
              <Feather name="calendar" size={size} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) =>
            Platform.OS === "ios" ? (
              <SymbolView name="clock.arrow.circlepath" tintColor={color} size={size} />
            ) : (
              <Feather name="clock" size={size} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
