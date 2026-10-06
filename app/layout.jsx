import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://tcva-awards-2026-live-checkin.vercel.app"),
  applicationName: "TCVA Live Check-In",
  title: {
    default: "TCVA Live Check-In",
    template: "%s | TCVA Live Check-In",
  },
  description: "Supabase-backed TCVA guest check-in, event archive and operations app.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TCVA Live Check-In",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  themeColor: "#050505",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
