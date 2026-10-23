import Landing from "@/components/Landing";

export const dynamic = "force-dynamic";

/**
 * صفحة الهبوط كرابط دائم: أي حد يقدر يفتحها — زائر أو مستخدم مسجّل دخوله.
 * دي الطريقة الوحيدة اللي المستخدم المسجّل يرجع بيها يشوف صفحة الهبوط
 * (التعريف الكامل، المميزات، الأسئلة الشائعة...) لأن الرئيسية بتودّيه للتطبيق مباشرة.
 */
export default function WelcomePage() {
  return <Landing />;
}
