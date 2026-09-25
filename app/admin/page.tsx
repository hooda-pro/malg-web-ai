import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import AdminShell from "./AdminShell";

export const dynamic = "force-dynamic";

/**
 * لوحة الأدمن — محمية من السيرفر نفسه: لو مش أدمن بيروح لـ 404.
 * الحماية في الـ UI مش كفاية؛ لازم كل طلب يمر على requireAdmin في
 * المسارات (lib/adminGuard.ts) — وده اللي بيحصل فعلاً.
 */
export default function AdminPage() {
  const admin = getAdminUser();
  if (!admin) redirect("/");

  return (
    <AdminShell
      admin={{
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
      }}
    />
  );
}