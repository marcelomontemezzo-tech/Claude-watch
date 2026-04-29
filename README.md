# claude-watch

Real-time supervision UI for Claude Code sessions. Open it on a second monitor and watch token usage, parallel agent execution, and live tool calls without touching your main terminal.

## Quick start

```bash
cd claude-watch
npm install
npm run dev
```

Then open http://127.0.0.1:1788

For a one-shot launch:

```bash
node bin/claude-watch.mjs dev
```

## How it works

claude-watch is **passive**: it tails the JSONL transcripts that Claude Code already writes to `~/.claude/projects/<project>/<sessionId>.jsonl`. It does not call the Anthropic API, does not inject tokens into your context, and does not influence Claude's behavior in any way.

- **Token & cost meter** — parses every assistant turn's `usage` block and applies model pricing.
- **Agent organogram** — detects every `Task`/`Agent` tool call and renders the resulting graph with parallel/sequential edges.
- **Available agents** — scans `.claude/agents`, `~/.claude/agents`, and plugin agents.
- **Live timeline** — streams tool calls, results, and assistant turns.
- **All-time totals** — aggregates across every session in `~/.claude/projects`.

## Architecture

```
~/.claude/projects/*.jsonl  ──►  chokidar  ──►  parser  ──►  Express SSE  ──►  React UI
```

Server runs on `127.0.0.1:1789`. Vite dev server (port 1788) proxies `/api` and `/events`.

## Performance impact on Claude

Zero. Read-only file watcher, no hooks required.
