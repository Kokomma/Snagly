export const researchSources = [
  {
    name: "HiringCafe",
    url: "https://hiringcafe.com/",
    description:
      "Explore company career-page jobs across professions, countries and work arrangements.",
    note: "Hourly search is available in Sources & settings. You can also browse and import a vacancy.",
  },
  {
    name: "LaborX",
    url: "https://laborx.com/",
    description:
      "Explore Web3 and crypto roles, including finance, operations, analysis and freelance work.",
    note: "Browse and apply on LaborX. Automatic platform access is not supported.",
  },
];
export function researchSourceFor(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host === "hiringcafe.com" ||
      host.endsWith(".hiringcafe.com") ||
      host === "hiring.cafe" ||
      host.endsWith(".hiring.cafe")
    )
      return "HiringCafe";
    if (host === "laborx.com" || host.endsWith(".laborx.com")) return "LaborX";
    return null;
  } catch {
    return null;
  }
}
