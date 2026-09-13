import { AppShell } from "@/components/layout/app-shell";
import { ProfileProvider } from "@/lib/profile-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProfileProvider>
      <AppShell>{children}</AppShell>
    </ProfileProvider>
  );
}
