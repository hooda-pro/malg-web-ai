import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// صورة المشاركة (OG): خلفية داكنة + لمسات terracotta.
// ملحوظة: لا يوجد أي نص عربي داخل الصورة — ImageResponse يرسم الحروف
// العربية بشكل سيئ، فكل النصوص هنا لاتينية فقط.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#09090b",
          color: "#f5f5f7",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "20px",
              backgroundColor: "#d97757",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "40px",
              fontWeight: 700,
              color: "#ffffff",
            }}
          >
            M
          </div>
          <div style={{ fontSize: "72px", fontWeight: 700, letterSpacing: "-2px" }}>
            MALG AI
          </div>
        </div>
        <div
          style={{
            marginTop: "28px",
            fontSize: "34px",
            color: "#a1a1aa",
            lineHeight: 1.4,
          }}
        >
          Chat, build and run code beside you
        </div>
        <div style={{ display: "flex", gap: "14px", marginTop: "44px" }}>
          {["Streaming", "Live preview", "API"].map((pill) => (
            <div
              key={pill}
              style={{
                padding: "12px 26px",
                borderRadius: "999px",
                border: "2px solid rgba(217,119,87,.4)",
                backgroundColor: "rgba(217,119,87,.16)",
                color: "#e0855f",
                fontSize: "24px",
                fontWeight: 600,
              }}
            >
              {pill}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
