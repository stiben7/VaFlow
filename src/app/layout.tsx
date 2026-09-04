import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DataProvider } from "@/lib/store";
import { DragProvider } from "@/lib/drag";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "VAFlow -- Client Prioritizer",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-full">
        <DataProvider>
          <DragProvider>
            <div className="flex h-dvh w-full overflow-hidden bg-canvas">
              <Sidebar />
              <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {children}
              </main>
            </div>
          </DragProvider>
        </DataProvider>
      </body>
    </html>
  );
}
