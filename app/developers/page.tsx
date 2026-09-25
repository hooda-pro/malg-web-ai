import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import DevConsole from "./DevConsole";

export const dynamic = "force-dynamic";

/** واجهة المطوّرين — إدارة مفاتيح الـ API وشرح طريقة الاستخدام. */
export default function DevelopersPage() {
  const user = getSessionUser();
  if (!user) redirect("/");

  return (
    <DevConsole
      user={{ id: user.id, email: user.email, displayName: user.displayName }}
    />
  );
}