import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { NativeWindStyleSheet } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "snagly.theme";

export const ThemeContext = createContext({
  colorScheme: "light",
  toggle: () => {},
  setScheme: (_scheme) => {},
});

export const ThemeProvider = ({ children }) => {
  const [colorScheme, setColorScheme] = useState("light");

  // Load stored preference
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === "dark" || stored === "light") {
          setColorScheme(stored);
          NativeWindStyleSheet.setColorScheme(stored);
        }
      } catch (e) {
        // no-op
      }
    })();
  }, []);

  // Persist and apply to NativeWind
  useEffect(() => {
    NativeWindStyleSheet.setColorScheme(colorScheme);
    AsyncStorage.setItem(STORAGE_KEY, colorScheme).catch(() => {});
  }, [colorScheme]);

  const toggle = useCallback(() => {
    setColorScheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const setScheme = useCallback((scheme) => {
    if (scheme === "dark" || scheme === "light") setColorScheme(scheme);
  }, []);

  const value = useMemo(() => ({ colorScheme, toggle, setScheme }), [colorScheme, toggle, setScheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

