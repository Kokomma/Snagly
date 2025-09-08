import React, { useContext } from "react";
import { Text, View } from "react-native";
import { ThemeContext } from "../theme/ThemeProvider";
import { ThemeToggle } from "../components/ThemeToggle";
import { LogoMark } from "../components/LogoMark";

export const HomeScreen = () => {
  const { colorScheme } = useContext(ThemeContext);
  const isDark = colorScheme === "dark";

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <View className="px-6 pt-12">
        <ThemeToggle />
      </View>
      <View className="flex-1 items-center justify-center px-6">
        <LogoMark scheme={isDark ? "dark" : "light"} size={180} />
        <Text className="mt-6 text-4xl font-extrabold text-black dark:text-white">
          Snagly
        </Text>
        <Text className="mt-2 text-center text-base text-neutral-600 dark:text-neutral-300">
          Your AI copilot for job discovery and automated applications.
        </Text>

        <View className="mt-8 w-full max-w-md rounded-2xl p-5 bg-funnel-100 dark:bg-zinc-900 border border-funnel-300/40 dark:border-zinc-800">
          <Text className="text-lg font-semibold text-funnel-900 dark:text-white">
            Quick Actions
          </Text>
          <View className="mt-4 h-[3px] w-20 bg-brand-accent rounded-full" />
          <View className="mt-4 gap-3">
            <View className="rounded-xl bg-white dark:bg-black border border-funnel-300/40 dark:border-zinc-800 p-4">
              <Text className="text-black dark:text-white font-medium">
                Upload Resume
              </Text>
              <Text className="text-neutral-600 dark:text-neutral-400 text-sm">
                Start onboarding by uploading your CV.
              </Text>
            </View>
            <View className="rounded-xl bg-white dark:bg-black border border-funnel-300/40 dark:border-zinc-800 p-4">
              <Text className="text-black dark:text-white font-medium">
                Set Preferences
              </Text>
              <Text className="text-neutral-600 dark:text-neutral-400 text-sm">
                Tell Snagly what roles to target.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

