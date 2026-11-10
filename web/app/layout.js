import "./globals.css";
export const metadata = {
  title: "Snagly · Your next chapter",
  description:
    "Your personal career workspace. Discover opportunities, prepare truthful applications, and move forward.",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
