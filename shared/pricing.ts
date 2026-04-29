import type { CostBreakdown, TokenUsage } from "./types.ts";

interface ModelPricing {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  contextLimit: number;
}

const M = 1_000_000;

const CATALOG: Record<string, ModelPricing> = {
  "claude-opus-4-7": {
    input: 15 / M,
    output: 75 / M,
    cacheWrite: 18.75 / M,
    cacheRead: 1.5 / M,
    contextLimit: 1_000_000,
  },
  "claude-sonnet-4-6": {
    input: 3 / M,
    output: 15 / M,
    cacheWrite: 3.75 / M,
    cacheRead: 0.3 / M,
    contextLimit: 1_000_000,
  },
  "claude-haiku-4-5": {
    input: 1 / M,
    output: 5 / M,
    cacheWrite: 1.25 / M,
    cacheRead: 0.1 / M,
    contextLimit: 200_000,
  },
};

const FALLBACK: ModelPricing = CATALOG["claude-sonnet-4-6"]!;

export function resolvePricing(modelId: string | undefined): ModelPricing {
  if (!modelId) return FALLBACK;
  const normalized = modelId.toLowerCase().replace(/\[.*\]$/, "").trim();
  for (const [key, value] of Object.entries(CATALOG)) {
    if (normalized.startsWith(key)) return value;
  }
  return FALLBACK;
}

export function computeCost(usage: TokenUsage, modelId: string | undefined): CostBreakdown {
  const p = resolvePricing(modelId);
  const input = usage.input * p.input;
  const output = usage.output * p.output;
  const cacheWrite = usage.cacheCreate * p.cacheWrite;
  const cacheRead = usage.cacheRead * p.cacheRead;
  return {
    input,
    output,
    cacheWrite,
    cacheRead,
    total: input + output + cacheWrite + cacheRead,
  };
}

export function contextLimitFor(modelId: string | undefined): number {
  return resolvePricing(modelId).contextLimit;
}

export function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
}

export function emptyCost(): CostBreakdown {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: 0 };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheCreate: a.cacheCreate + b.cacheCreate,
    cacheRead: a.cacheRead + b.cacheRead,
  };
}

export function addCost(a: CostBreakdown, b: CostBreakdown): CostBreakdown {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead,
    total: a.total + b.total,
  };
}

export function totalTokens(u: TokenUsage): number {
  return u.input + u.output + u.cacheCreate + u.cacheRead;
}

// Tokens that count toward Claude usage / rate limits.
// Cache reads are excluded (matches Claude Code subscription limit semantics).
export function billableTokens(u: TokenUsage): number {
  return u.input + u.output + u.cacheCreate;
}

export function cacheHitRate(u: TokenUsage): number {
  const denom = u.input + u.cacheRead + u.cacheCreate;
  if (denom === 0) return 0;
  return u.cacheRead / denom;
}
