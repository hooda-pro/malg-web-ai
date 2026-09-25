import ChatShell from "@/components/ChatShell";
import { SettingsProvider } from "@/components/SettingsContext";

export default function Home() {
  return (
    <SettingsProvider>
      <ChatShell />
    </SettingsProvider>
  );
}
