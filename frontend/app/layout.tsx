import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIS Vessel Tracker",
  description:
    "Osservazioni AIS nel Mediterraneo, storico e soste rilevate. Beta pubblica.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
