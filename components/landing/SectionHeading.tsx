export default function SectionHeading({
  id,
  eyebrow,
  title,
  body,
  align = "center",
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  body?: string;
  align?: "center" | "start";
}) {
  const centered = align === "center";
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="text-[13px] font-semibold text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-balance text-[clamp(28px,4.2vw,44px)] font-semibold leading-[1.2] tracking-display">
        {title}
      </h2>
      {body && <p className={`mt-4 text-pretty text-[16px] leading-8 text-ink-2 ${centered ? "mx-auto" : ""} max-w-[56ch]`}>{body}</p>}
    </div>
  );
}
