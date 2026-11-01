// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { getSupabaseAdminEnv, isPublishableKey } from "@/lib/supabase/env";

const jwt = (payload: object) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

afterEach(() => vi.unstubAllEnvs());

describe("SUPABASE_SERVICE_ROLE_KEY", () => {
  it("publishable-ключ вместо secret — service role считается не настроенным", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_publishable_fake0000000000000000000000000");
    expect(getSupabaseAdminEnv()).toBeNull();
    expect(error.mock.calls[0][0]).toContain("нужен secret key");
  });

  it("secret-ключ принимается (пробелы по краям обрезаются)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", " sb_secret_fake0000000000000000000000000 ");
    expect(getSupabaseAdminEnv()).toEqual({
      url: "https://example.supabase.co",
      serviceRoleKey: "sb_secret_fake0000000000000000000000000",
    });
  });

  it("legacy JWT: anon — publishable, service_role — нет", () => {
    expect(isPublishableKey(jwt({ role: "anon" }))).toBe(true);
    expect(isPublishableKey(jwt({ role: "service_role" }))).toBe(false);
    expect(isPublishableKey("sb_secret_fake")).toBe(false);
    expect(isPublishableKey("eyJ.not-base64.x")).toBe(false);
  });
});
