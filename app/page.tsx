import AppRouter from "@/components/AppRouter";
import HomeGate from "@/components/HomeGate";
import Landing from "@/components/Landing";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** مسجّل دخول → التطبيق مباشرة. زائر → صفحة الهبوط (والـhash زي /#/admin بيفتح التطبيق). */
export default async function Home() {
  const user = await getSessionUser();
  if (user) return <AppRouter />;
  return <HomeGate landing={<Landing />} />;
}
