"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "../../generated/prisma";
import { prisma } from "@/lib/prisma";
import { newPassportCode, normalizePassportCode, passportSchema, sessionSchema } from "@/lib/hri/passport";

// Saves the comfort passport learned in a Living Lab encounter and the encounter log.
// Public by design (visitors create passports); input is validated and size-limited.
export async function createPassportAction(passportRaw: unknown, sessionRaw: unknown) {
  const passport = passportSchema.parse(passportRaw);
  const session = sessionSchema.parse(sessionRaw);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newPassportCode();
    try {
      const created = await prisma.hriPassport.create({
        data: {
          code,
          nickname: passport.nickname || null,
          greeting: passport.greeting,
          comfortDistance: passport.comfortDistance,
          speed: passport.speed,
          gaze: passport.gaze,
          voice: passport.voice,
          language: passport.language,
          sessions: {
            create: {
              protocol: session.protocol,
              inputMode: session.inputMode,
              robotModelId: session.robotModelId || null,
              eventsJson: session.events as Prisma.InputJsonValue,
              summaryJson: session.summary as Prisma.InputJsonValue,
              endedAt: new Date()
            }
          }
        }
      });
      revalidatePath("/living-lab");
      return { code: created.code };
    } catch (error) {
      // Unique-code collision: try another code.
      if ((error as { code?: string }).code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a passport code. Please try again.");
}

// Records a meeting between a passport holder and a robot from the atlas registry.
export async function recordMeetingAction(codeRaw: string, sessionRaw: unknown) {
  const code = normalizePassportCode(codeRaw);
  const session = sessionSchema.parse(sessionRaw);
  const passport = await prisma.hriPassport.findUnique({ where: { code }, select: { id: true } });
  if (!passport) throw new Error("Passport not found.");

  const robotModelId = session.robotModelId
    ? (await prisma.robotModel.findUnique({ where: { id: session.robotModelId }, select: { id: true } }))?.id ?? null
    : null;

  await prisma.hriSession.create({
    data: {
      protocol: "passport_meeting",
      inputMode: session.inputMode,
      passportId: passport.id,
      robotModelId,
      eventsJson: session.events as Prisma.InputJsonValue,
      summaryJson: session.summary as Prisma.InputJsonValue,
      endedAt: new Date()
    }
  });
  revalidatePath("/living-lab");
  return { ok: true };
}
