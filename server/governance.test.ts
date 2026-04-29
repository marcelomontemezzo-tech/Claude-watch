import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmp: string;
let originalHome: string | undefined;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-watch-gov-"));
  originalHome = process.env.USERPROFILE;
  process.env.USERPROFILE = tmp;
  process.env.HOME = tmp;
  vi.resetModules();
});

afterEach(() => {
  if (originalHome != null) process.env.USERPROFILE = originalHome;
  delete process.env.HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function loadGovernance(): Promise<typeof import("./governance.ts")> {
  return import("./governance.ts");
}

describe("governance budgets", () => {
  it("returns empty map when file is missing", async () => {
    const gov = await loadGovernance();
    expect(gov.readBudgets()).toEqual({});
  });

  it("writes and reads a project budget round-trip", async () => {
    const gov = await loadGovernance();
    gov.writeBudget("proj-A", { monthly: 25, alertThreshold: 0.7, rolloverDay: 5 });
    expect(gov.readBudgets()["proj-A"]).toEqual({
      monthly: 25,
      alertThreshold: 0.7,
      rolloverDay: 5,
    });
  });

  it("rejects an invalid alertThreshold", async () => {
    const gov = await loadGovernance();
    expect(() =>
      gov.writeBudget("proj-A", { monthly: 10, alertThreshold: 2, rolloverDay: 1 }),
    ).toThrow();
  });

  it("clears a budget when null is passed", async () => {
    const gov = await loadGovernance();
    gov.writeBudget("proj-A", { monthly: 10, alertThreshold: 0.8, rolloverDay: 1 });
    gov.writeBudget("proj-A", null);
    expect(gov.readBudgets()["proj-A"]).toBeUndefined();
  });
});

describe("governance tags", () => {
  it("normalizes tags: trim, dedupe, sort, drop empty", async () => {
    const gov = await loadGovernance();
    gov.writeTags("proj-A", [" ops ", "ops", "client-acme", "  ", "client-acme"]);
    expect(gov.readTags()["proj-A"]).toEqual(["client-acme", "ops"]);
  });

  it("removes the project entry when tags become empty", async () => {
    const gov = await loadGovernance();
    gov.writeTags("proj-A", ["ops"]);
    gov.writeTags("proj-A", []);
    expect(gov.readTags()["proj-A"]).toBeUndefined();
  });

  it("listAllTags aggregates across projects", async () => {
    const gov = await loadGovernance();
    gov.writeTags("a", ["one", "shared"]);
    gov.writeTags("b", ["two", "shared"]);
    expect(gov.listAllTags()).toEqual(["one", "shared", "two"]);
  });
});

describe("rolloverWindowStart", () => {
  it("anchors the start to the configured rollover day in the current month", async () => {
    const gov = await loadGovernance();
    const ref = new Date("2026-04-29T10:00:00.000Z");
    const start = gov.rolloverWindowStart(1, ref);
    const startDate = new Date(start);
    expect(startDate.getDate()).toBe(1);
    expect(start).toBeLessThan(ref.getTime());
  });

  it("wraps back a month when the rollover day is later than today", async () => {
    const gov = await loadGovernance();
    const ref = new Date("2026-04-05T10:00:00.000Z");
    const start = gov.rolloverWindowStart(20, ref);
    const startDate = new Date(start);
    expect(startDate.getMonth()).toBe(2); // March
    expect(startDate.getDate()).toBe(20);
  });
});
