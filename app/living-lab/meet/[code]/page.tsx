import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizePassportCode } from "@/lib/hri/passport";
import MeetClient from "./MeetClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Passport Meeting | HRI Living Lab",
  robots: { index: false, follow: false }
};

const CARE_TYPES = /hospital|medical|elder|care|rehab|therapy|telepresence|companion|assist|service/i;

type Params = Promise<{ code: string }>;
type SearchParams = Promise<{ robot?: string }>;

export default async function MeetPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { code: rawCode } = await params;
  const { robot: robotId } = await searchParams;
  const code = normalizePassportCode(rawCode);
  const lang = ((await cookies()).get("lang")?.value || "en") as "en" | "th";

  const passport = await prisma.hriPassport.findUnique({
    where: { code },
    select: { code: true, greeting: true, comfortDistance: true, speed: true, gaze: true, voice: true, language: true }
  });
  if (!passport) redirect("/living-lab/meet?error=not_found");

  const robotRows = await prisma.robotModel.findMany({
    select: { id: true, canonicalName: true, robotType: true, developerOrg: true, manufacturer: true, primaryUseCase: true },
    orderBy: { canonicalName: "asc" }
  });
  const robots = robotRows
    .filter((r) => CARE_TYPES.test(r.robotType))
    .map((r) => ({ id: r.id, name: r.canonicalName, type: r.robotType, org: r.developerOrg ?? r.manufacturer ?? null, useCase: r.primaryUseCase }));
  const selected = robots.find((r) => r.id === robotId) ?? robots.find((r) => /Mr SAM/i.test(r.name)) ?? robots[0] ?? null;

  return <MeetClient lang={lang} passport={passport} robots={robots} selectedId={selected?.id ?? null} />;
}
