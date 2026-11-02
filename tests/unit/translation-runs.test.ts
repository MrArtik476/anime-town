// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { BackfillReport } from "@/lib/localization/backfill";
import {
  CRON_SECRET_HEADER,
  errorMessage,
  handleTranslateCronRequest,
  type RunJournal,
  runJournaledBackfill,
  runStatus,
  secretMatches,
  supabaseSecretKey,
} from "@/lib/localization/runs";

const SECRET = "test-cron-secret";

const report = (overrides: Partial<BackfillReport> = {}): BackfillReport => ({
  translator: "deepl",
  candidates: 10,
  pending: 3,
  translated: 3,
  characters: 1200,
  batches: 1,
  skippedOversized: 0,
  stopped: null,
  usage: { used: 5000, limit: 500_000, ownLimit: 450_000 },
  ...overrides,
});

/** Журнал в памяти с той же блокировкой, что у begin_translation_run: один running одновременно. */
function memoryJournal() {
  const runs: { id: number; trigger: string; status: string; report: BackfillReport | null; error: string | null }[] = [];
  const journal: RunJournal = {
    begin: vi.fn(async (trigger) => {
      if (runs.some((run) => run.status === "running")) return null;
      const id = runs.length + 1;
      runs.push({ id, trigger, status: "running", report: null, error: null });
      return id;
    }),
    finish: vi.fn(async (id, outcome) => {
      Object.assign(runs.find((run) => run.id === id)!, outcome);
    }),
  };
  return { journal, runs };
}

const request = (init: { method?: string; secret?: string | null; body?: string } = {}) =>
  new Request("https://example.supabase.co/functions/v1/translate-cron", {
    method: init.method ?? "POST",
    headers: init.secret === null ? {} : { [CRON_SECRET_HEADER]: init.secret ?? SECRET },
    body: init.method === "GET" ? undefined : init.body,
  });

describe("runStatus", () => {
  it("ok — без остановки; stopped — штатная остановка; failed — сбой настройки или базы", () => {
    expect(runStatus(report())).toBe("ok");
    expect(runStatus(report({ stopped: "budget_exhausted" }))).toBe("stopped");
    expect(runStatus(report({ stopped: "QUOTA_EXCEEDED" }))).toBe("stopped");
    expect(runStatus(report({ stopped: "store_error" }))).toBe("failed");
    expect(runStatus(report({ stopped: "no_translator" }))).toBe("failed");
  });
});

describe("runJournaledBackfill", () => {
  it("записывает итог запуска со счётчиками отчёта", async () => {
    const { journal, runs } = memoryJournal();
    const run = await runJournaledBackfill({ journal, trigger: "cron", backfill: async () => report() });
    expect(run).toMatchObject({ busy: false, runId: 1, status: "ok" });
    expect(runs[0]).toMatchObject({ trigger: "cron", status: "ok", error: null, report: { translated: 3, characters: 1200 } });
  });

  it("пока идёт другой запуск, заполнение не начинается", async () => {
    const { journal } = memoryJournal();
    await journal.begin("manual");
    const backfill = vi.fn(async () => report());
    expect(await runJournaledBackfill({ journal, trigger: "cron", backfill })).toEqual({ busy: true });
    expect(backfill).not.toHaveBeenCalled();
  });

  it("исключение заполнения — failed с сообщением, исключение пробрасывается, блокировка снята", async () => {
    const { journal, runs } = memoryJournal();
    await expect(
      runJournaledBackfill({
        journal,
        trigger: "cron",
        backfill: async () => {
          throw new Error("AniList недоступен\n  503");
        },
      }),
    ).rejects.toThrow("AniList недоступен");
    expect(runs[0]).toMatchObject({ status: "failed", report: null, error: "Error: AniList недоступен 503" });
    expect(await journal.begin("cron")).toBe(2);
  });

  it("сбой записи итога не роняет запуск", async () => {
    const { journal } = memoryJournal();
    journal.finish = vi.fn(async () => {
      throw new Error("db down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const run = await runJournaledBackfill({ journal, trigger: "manual", backfill: async () => report() });
    expect(run).toMatchObject({ busy: false, status: "ok" });
  });

  it("без журнала (E2E) — просто запуск", async () => {
    const run = await runJournaledBackfill({ journal: null, trigger: "manual", backfill: async () => report() });
    expect(run).toMatchObject({ busy: false, runId: null, status: "ok" });
  });
});

describe("handleTranslateCronRequest", () => {
  const deps = (overrides: Partial<Parameters<typeof handleTranslateCronRequest>[1]> = {}) => {
    const { journal, runs } = memoryJournal();
    const backfill = vi.fn(async (_options: { limit: number | undefined }) => report());
    return { deps: { secret: SECRET, journal, backfill, ...overrides }, journal, backfill, runs };
  };

  it("без секрета, с неверным секретом и когда CRON_SECRET не задан — 401, заполнение не запускается", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const [req, secret] of [
      [request({ secret: null }), SECRET],
      [request({ secret: "wrong" }), SECRET],
      [request({ secret: `${SECRET}x` }), SECRET],
      [request(), undefined],
      [request({ secret: "" }), ""],
    ] as const) {
      const { deps: d, backfill } = deps({ secret });
      const response = await handleTranslateCronRequest(req, d);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
      expect(backfill).not.toHaveBeenCalled();
    }
  });

  it("не POST — 405 с Allow", async () => {
    const { deps: d } = deps();
    const response = await handleTranslateCronRequest(request({ method: "GET" }), d);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("по расписанию: trigger cron по умолчанию, без limit, отчёт без текстов", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { deps: d, backfill, runs } = deps();
    const response = await handleTranslateCronRequest(request({ body: JSON.stringify({ trigger: "cron" }) }), d);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: true, runId: 1, status: "ok", report: { translated: 3, characters: 1200 } });
    expect(backfill).toHaveBeenCalledWith({ limit: undefined });
    expect(runs[0].trigger).toBe("cron");

    const empty = deps();
    expect((await handleTranslateCronRequest(request(), empty.deps)).status).toBe(200);
    expect(empty.runs[0].trigger).toBe("cron");
  });

  it("ручной вызов с limit; limit строкой тоже принимается", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { deps: d, backfill, runs } = deps();
    await handleTranslateCronRequest(request({ body: JSON.stringify({ trigger: "manual", limit: 5 }) }), d);
    expect(backfill).toHaveBeenCalledWith({ limit: 5 });
    expect(runs[0].trigger).toBe("manual");

    const second = deps();
    await handleTranslateCronRequest(request({ body: JSON.stringify({ limit: "7" }) }), second.deps);
    expect(second.backfill).toHaveBeenCalledWith({ limit: 7 });
  });

  it("неверное тело и limit вне 1–100 — 400 без запуска", async () => {
    for (const body of ["not json", "[1]", JSON.stringify({ trigger: "nightly" }), JSON.stringify({ limit: 0 }), JSON.stringify({ limit: 101 }), JSON.stringify({ limit: 2.5 })]) {
      const { deps: d, backfill, runs } = deps();
      const response = await handleTranslateCronRequest(request({ body }), d);
      expect(response.status).toBe(400);
      expect(backfill).not.toHaveBeenCalled();
      expect(runs).toHaveLength(0);
    }
  });

  it("двойной запуск — 409 already_running, символы не тратятся", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps: d, journal, backfill } = deps();
    await journal.begin("cron");
    const response = await handleTranslateCronRequest(request(), d);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "already_running" });
    expect(backfill).not.toHaveBeenCalled();
  });

  it("сбой настройки (no_translator) — 500 и failed в журнале; исключение — 502", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = deps({ backfill: async () => report({ stopped: "no_translator", translated: 0, characters: 0 }) });
    const response = await handleTranslateCronRequest(request(), failed.deps);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, status: "failed" });
    expect(failed.runs[0].status).toBe("failed");

    const thrown = deps({
      backfill: async () => {
        throw new Error("boom");
      },
    });
    const crash = await handleTranslateCronRequest(request(), thrown.deps);
    expect(crash.status).toBe(502);
    expect(await crash.json()).toEqual({ ok: false, error: "backfill_failed" });
    expect(thrown.runs[0]).toMatchObject({ status: "failed", error: "Error: boom" });
  });

  it("квота исчерпана — штатно: 200, status stopped", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { deps: d } = deps({ backfill: async () => report({ stopped: "budget_exhausted" }) });
    const response = await handleTranslateCronRequest(request(), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: "stopped" });
  });
});

describe("secretMatches", () => {
  it("совпадение только при полном равенстве", () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true);
    expect(secretMatches(null, SECRET)).toBe(false);
    expect(secretMatches("", SECRET)).toBe(false);
    expect(secretMatches(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(secretMatches(`${SECRET}!`, SECRET)).toBe(false);
    expect(secretMatches("секрет", "секрет")).toBe(true);
  });
});

describe("supabaseSecretKey", () => {
  it("новые ключи: default из SUPABASE_SECRET_KEYS важнее устаревшего service_role", () => {
    expect(
      supabaseSecretKey({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_new"}', SUPABASE_SERVICE_ROLE_KEY: "eyJ.legacy" }),
    ).toEqual({ key: "sb_secret_new", source: "SUPABASE_SECRET_KEYS" });
  });

  it("ручная замена секретом функции важнее подставленных", () => {
    expect(
      supabaseSecretKey({ TRANSLATE_SUPABASE_SECRET_KEY: " sb_secret_manual ", SUPABASE_SECRET_KEYS: '{"default":"sb_secret_new"}' }),
    ).toEqual({ key: "sb_secret_manual", source: "TRANSLATE_SUPABASE_SECRET_KEY" });
  });

  it("нет default или битый JSON — устаревший ключ; нет ничего — null", () => {
    expect(supabaseSecretKey({ SUPABASE_SECRET_KEYS: '{"other":"x"}', SUPABASE_SERVICE_ROLE_KEY: "eyJ.legacy" })).toEqual({
      key: "eyJ.legacy",
      source: "SUPABASE_SERVICE_ROLE_KEY",
    });
    expect(supabaseSecretKey({ SUPABASE_SECRET_KEYS: "{", SUPABASE_SERVICE_ROLE_KEY: "eyJ.legacy" })?.source).toBe(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    expect(supabaseSecretKey({})).toBeNull();
  });
});

describe("errorMessage", () => {
  it("одна строка не длиннее 500 символов", () => {
    expect(errorMessage(new TypeError("a\nb"))).toBe("TypeError: a b");
    expect(errorMessage("x".repeat(900))).toHaveLength(500);
  });
});
