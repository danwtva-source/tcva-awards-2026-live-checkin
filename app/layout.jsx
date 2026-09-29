import "./globals.css";

export const metadata = {
  title: "TCVA Awards 2026 Live Check-In",
  description: "Supabase-backed TCVA Awards 2026 guest check-in and event operations app.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
