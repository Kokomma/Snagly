import React, { useContext } from "react";
import { Pressable, Text, View } from "react-native";
import { ThemeContext } from "../theme/ThemeProvider";

export const ThemeToggle = () => {
  const { colorScheme, toggle } = useContext(ThemeContext);
  const isDark = colorScheme === "dark";
  return (
    <View className="items-end">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle theme"
        onPress={toggle}
        className="rounded-full p-2 bg-funnel-500/10 dark:bg-white/10"
      >
        <Text className="text-2xl" selectable={false}>
          {isDark ? "☀️" : "🌙"}
        </Text>
      </Pressable>
    </View>
  );
};

