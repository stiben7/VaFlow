import { DataProvider } from "@/lib/store";
import { DragProvider } from "@/lib/drag";
import { ThemeProvider } from "@/lib/theme";
import Sidebar from "@/components/Sidebar";

/**
 * The signed-in shell. Middleware has already guaranteed a session by the time
 * anything in this group renders (in cloud mode), so children can assume a
 * user exists.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}
