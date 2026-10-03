import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { normalizePassportCode } from "@/lib/hri/passport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Meet a Robot with Your HRI Passport | Thailand Humanoid Atlas",
  alternates: { canonical: "/living-lab/meet" }
};

type SearchParams = Promise<{ code?: string; robot?: string; error?: string }>;

export default async function MeetEntryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const robotQuery = params.robot ? `?robot=${encodeURIComponent(params.robot)}` : "";
  if (params.code) {
    const code = normalizePassportCode(params.code);
    if (code.length === 6) redirect(`/living-lab/meet/${code}${robotQuery}`);
  }
  const lang = ((await cookies()).get("lang")?.value || "en") as "en" | "th";
  const th = lang === "th";

  return (
    <div style={{ maxWidth: 520, margin: "32px auto", display: "grid", gap: 16 }}>
      <h1>{th ? "พบหุ่นยนต์ด้วย HRI Passport" : "Meet a robot with your HRI Passport"}</h1>
      <p className="muted">
        {th ? "ใส่รหัส 6 ตัวจากพาสปอร์ตของคุณ หรือสแกน QR ที่ได้จาก Living Lab" : "Enter the 6-character code from your passport, or scan the QR code you got in the Living Lab."}
      </p>
      {params.error === "not_found" && (
        <div className="notice" style={{ borderLeftColor: "var(--danger)" }}>{th ? "ไม่พบพาสปอร์ตรหัสนี้" : "No passport with that code."}</div>
      )}
      <form method="get" action="/living-lab/meet" className="form panel" style={{ gap: 12 }}>
        <label>
          {th ? "รหัสพาสปอร์ต" : "Passport code"}
          <input name="code" required minLength={6} maxLength={7} autoComplete="off" autoCapitalize="characters" placeholder="e.g. 7KQ4MZ" style={{ fontSize: 24, letterSpacing: 4, textTransform: "uppercase" }} />
        </label>
        {params.robot && <input type="hidden" name="robot" value={params.robot} />}
        <button type="submit" className="primary">{th ? "พบหุ่นยนต์" : "Meet the robot"}</button>
      </form>
      <Link href="/living-lab">{th ? "ยังไม่มีพาสปอร์ต? สร้างใน Living Lab →" : "No passport yet? Create one in the Living Lab →"}</Link>
    </div>
  );
}
