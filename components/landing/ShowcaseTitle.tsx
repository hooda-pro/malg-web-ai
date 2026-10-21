"use client";

import { useSettings } from "../SettingsContext";

/** عنوان سكرين-ريدر لقسم المعاينة — عميل عشان يترجم حيًا. */
export default function ShowcaseTitle() {
  const { t } = useSettings();
  return (
    <h2 id="showcase-title" className="sr-only">
      {t("lpShowcase")}
    </h2>
  );
}
