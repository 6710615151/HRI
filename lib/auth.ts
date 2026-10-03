import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-session";

// Server-side admin check for pages and server actions. Only a valid signed session counts;
// the user_role cookie is display-only and is never trusted for authorization.
export async function getAdminSession() {
  const cookieStore = await cookies();
  return verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value);
}

export async function isAdmin() {
  return (await getAdminSession()) !== null;
}

// Server actions are public HTTP endpoints, so every mutating action must call this itself.
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error("Unauthorized: administrator sign-in required.");
  return session;
}
