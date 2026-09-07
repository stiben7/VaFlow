import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VAFlow · Client Prioritizer",
  description:
    "Drag your client roster onto a week and see, at a glance, what actually gets your attention.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121114" },
  ],
};

/**
 * Deliberately bare. The sidebar, the data provider and the drag engine all
 * live in the (app) group instead, so /login and the auth routes do not mount
 * a Supabase query or render an app chrome the visitor cannot use yet.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-full">{children}</body>
    </html>
  );
}
