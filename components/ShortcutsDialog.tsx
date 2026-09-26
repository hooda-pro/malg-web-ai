"use client";

import { useEffect, useState } from "react";
import { Dialog, Kbd, Panel, modKeyLabel } from "./ui/Controls";
import { useSettings } from "./SettingsContext";

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t, enterToSend } = useSettings();
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => setMod(modKeyLabel()), []);

  const rows: { label: string; keys: string[] }[] = [
    { label: t("scNewChat"), keys: [mod, "⇧", "O"] },
    { label: t("scSidebar"), keys: [mod, "⇧", "S"] },
    { label: t("scFocus"), keys: ["⇧", "Esc"] },
    { label: t("scSettings"), keys: [mod, ","] },
    { label: t("scShortcuts"), keys: [mod, "/"] },
    { label: t("scSend"), keys: enterToSend ? ["Enter"] : [mod, "Enter"] },
    { label: t("scNewline"), keys: enterToSend ? ["⇧", "Enter"] : ["Enter"] },
  ];

  return (
    <Dialog open onClose={onClose} title={t("shortcutsTitle")} labelledBy="mlag-shortcuts-title">
      <Panel className="mb-4">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-4 border-t border-hair px-4 py-3 first:border-t-0"
          >
            <span className="text-[13.5px] text-ink">{r.label}</span>
            <span className="flex shrink-0 items-center gap-1" dir="ltr">
              {r.keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </Panel>
    </Dialog>
  );
}
