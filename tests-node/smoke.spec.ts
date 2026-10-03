import { test, expect } from "@playwright/test";

test("smoke test - crawl all routes as admin", async ({ page }) => {
  const user = process.env.ADMIN_BASIC_USER;
  const password = process.env.ADMIN_BASIC_PASSWORD;
  test.skip(!user || !password, "Set ADMIN_BASIC_USER and ADMIN_BASIC_PASSWORD to run the admin crawl.");

  // Sign in through the real admin login (the self-service admin buttons were removed).
  await page.goto("/admin-login");
  await page.fill('input[name="email"]', user!);
  await page.fill('input[name="password"]', password!);
  await page.click('button[type="submit"]');
  // Wait for the post-login redirect itself; /admin-login would also match a looser /admin pattern.
  await page.waitForURL((url) => url.pathname === "/admin");

  const routes = [
    "/",
    "/dashboard",
    "/perspectives",
    "/robots",
    "/inventory",
    "/contributions",
    "/analytics",
    "/database",
    "/submit-data",
    "/admin",
  ];

  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);

    // Expect an h1 header element to exist on the page
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible({ timeout: 10000 });
    const text = await h1.innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  }
});

test("security - visitors cannot become admin", async ({ page, context }) => {
  // No self-service admin controls on the profile page.
  await page.goto("/profile");
  await expect(page.locator('button:has-text("Login as Administrator")')).toHaveCount(0);
  await expect(page.locator('select[name="role"]')).toHaveCount(0);

  // The old forgeable cookies no longer grant access.
  await context.addCookies([
    { name: "admin_session", value: "true", url: "http://localhost:3000" },
    { name: "user_role", value: "ADMIN", url: "http://localhost:3000" }
  ]);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin-login/);

  // Protected APIs reject the old default credentials.
  const res = await page.request.get("/api/export", {
    headers: { authorization: `Basic ${Buffer.from("creativelab.co.th@gmail.com:I@M_Cr3LabTH_F4M").toString("base64")}` }
  });
  expect(res.status()).toBe(401);
});
