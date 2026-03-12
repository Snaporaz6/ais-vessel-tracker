import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AIS Vessel Tracker',
  description: 'Real-time vessel tracking with AIS data — free alternative to MarineTraffic',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
