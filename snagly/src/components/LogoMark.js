import React from "react";
import Svg, { Path } from "react-native-svg";

export const LogoMark = ({ scheme = "light", size = 80 }) => {
  const isDark = scheme === "dark";
  const width = size;
  const height = size * 0.8;

  // Funnel composed of 4 trapezoids
  return (
    <Svg width={width} height={height} viewBox="0 0 100 80">
      {/* Blue top */}
      <Path d="M5 10 H95 L85 25 H15 Z" fill="#6ab0ff" />
      {/* Mid blue */}
      <Path d="M15 25 H85 L77 38 H23 Z" fill="#2a8fff" />
      {/* Aqua */}
      <Path d="M23 38 H77 L71 49 H29 Z" fill="#2ed3e6" />
      {/* Mint to forest */}
      <Path d="M29 49 H71 L66 60 H34 Z" fill="#16c784" />
      {/* Stem */}
      <Path d="M47 60 H53 L50 75 Z" fill="#0a3d2e" />
    </Svg>
  );
};

