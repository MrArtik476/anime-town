import { describe, expect, it, vi } from "vitest";

import { anilistRequest, compactVariables } from "@/lib/anilist/client";
import { AniListError } from "@/lib/anilist/errors";
import type { GraphQLDocument } from "@/lib/anilist/queries";

const QUERY = "query Test { Media { id } }" as GraphQLDocument<{ Media: { id: number } }, Record<string, unknown>>;

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const setup = (...responses: (Response | Error)[]) => {
  const fetchImpl = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchImpl.mockRejectedValueOnce(response);
    else fetchImpl.mockResolvedValueOnce(response);
  }
  const sleep = vi.fn(async () => {});
  return { fetchImpl, sleep, options: { fetchImpl, sleep, endpoint: "https://example.test/graphql" } };
};

describe("compactVariables", () => {
  it("убирает null и undefined, но оставляет 0, false и пустые массивы", () => {
    expect(compactVariables({ a: null, b: undefined, c: 0, d: false, e: [], f: "x" })).toEqual({
      c: 0,
      d: false,
      e: [],
      f: "x",
    });
  });
});

describe("anilistRequest", () => {
  it("отправляет POST с запросом и без null-переменных, возвращает data", async () => {
    const { fetchImpl, options } = setup(jsonResponse({ data: { Media: { id: 1 } } }));

    const data = await anilistRequest(QUERY, { id: 1, search: null }, options);

    expect(data).toEqual({ Media: { id: 1 } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.test/graphql");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ query: QUERY, variables: { id: 1 } });
  });

  it("превращает GraphQL-ошибку со статусом 404 в NOT_FOUND без повторов", async () => {
    const { fetchImpl, options } = setup(jsonResponse({ errors: [{ message: "Not Found.", status: 404 }] }, 404));

    await expect(anilistRequest(QUERY, {}, options)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("при 429 с коротким Retry-After ждёт и повторяет запрос", async () => {
    const { fetchImpl, sleep, options } = setup(
      jsonResponse({}, 429, { "Retry-After": "2" }),
      jsonResponse({ data: { Media: { id: 7 } } }),
    );

    await expect(anilistRequest(QUERY, {}, options)).resolves.toEqual({ Media: { id: 7 } });
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("при 429 с долгим Retry-After сразу сообщает RATE_LIMITED", async () => {
    const { fetchImpl, sleep, options } = setup(jsonResponse({}, 429, { "Retry-After": "60" }));

    const error = await anilistRequest(QUERY, {}, options).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AniListError);
    expect(error).toMatchObject({ code: "RATE_LIMITED", retryAfter: 60 });
    expect(sleep).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("повторяет 5xx с нарастающей паузой и после исчерпания попыток даёт NETWORK", async () => {
    const { fetchImpl, sleep, options } = setup(jsonResponse({}, 502), jsonResponse({}, 503), jsonResponse({}, 500));

    await expect(anilistRequest(QUERY, {}, options)).rejects.toMatchObject({ code: "NETWORK", status: 500 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[500], [1000]]);
  });

  it("восстанавливается после сетевого сбоя", async () => {
    const { fetchImpl, options } = setup(new TypeError("fetch failed"), jsonResponse({ data: { Media: { id: 3 } } }));

    await expect(anilistRequest(QUERY, {}, options)).resolves.toEqual({ Media: { id: 3 } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("сетевой сбой без попыток — NETWORK", async () => {
    const { options } = setup(new TypeError("fetch failed"));

    await expect(anilistRequest(QUERY, {}, { ...options, retries: 0 })).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("прочие GraphQL-ошибки — BAD_RESPONSE с текстом AniList", async () => {
    const { options } = setup(jsonResponse({ errors: [{ message: "Validation error", status: 400 }] }, 400));

    await expect(anilistRequest(QUERY, {}, options)).rejects.toMatchObject({
      code: "BAD_RESPONSE",
      message: "Validation error",
    });
  });

  it("некорректный JSON — BAD_RESPONSE", async () => {
    const { options } = setup(new Response("<html>oops</html>", { status: 200 }));

    await expect(anilistRequest(QUERY, {}, options)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
});
