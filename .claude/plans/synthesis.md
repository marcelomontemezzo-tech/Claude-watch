# Synthesis — Maestri × Paperclip × claude-watch

## Context

Goal: absorver o melhor de **Maestri** (canvas espacial, agentes em concerto, andares isolados) e **Paperclip** (governança hierárquica, budgets, audit, multi-tenancy) sem violar o charter passivo de claude-watch (zero tokens adicionais).

References:
- Maestri — https://www.themaestri.app/pt-br
- Paperclip — https://paperclip.ing/

Restrição central: **nenhum prompt injetado, nenhuma chamada API, nenhum hook bloqueante**. Tudo derivado do JSONL que Claude Code já escreve em `~/.claude/projects/...` e persistência local em `~/.claude/watch/*.json`.

---

## Estratégia em 3 fases

Cada fase é independente e mergeable. Branch dedicada por fase (ver "Branch strategy" no fim).

### Fase 2 — Governança (Paperclip DNA) — **prioridade 1**

Camada de overlay sobre o dashboard atual. Alto valor, baixo risco, reusa infra existente.

**Features:**
- **Budgets por projeto** — usuário define teto mensal local. claude-watch agrega `totalCost` (já calculado em `server/watcher.ts`) e mostra barra + estado `under/near/over`. **Não throttla** (não pode, é passive). Apenas alerta visual e browser notification opcional.
- **Tags / multi-tenancy** — labels por projeto (cliente, time, ambiente). Filtro de canvas por tag. Persistido em `~/.claude/watch/tags.json`.
- **Hierarquia explícita** — project (org) → session (dept) → main turn (manager) → subagent (worker). Já temos os dados; só acrescentar role labels e estilo no flow graph atual.
- **Audit log persistente + export** — dump filtrável de `recentEvents` exportável como NDJSON ou CSV. Eventos já existem em `parsed.events`. Adicionar UI de filtro (kind, date range, project) e download.

**Arquivos:**
- `server/governance.ts` (novo) — leitura/escrita atômica de `~/.claude/watch/{budgets,tags}.json`.
- `server/index.ts` — endpoints `GET/PUT /api/governance/budgets`, `GET/PUT /api/governance/tags`, `GET /api/audit/export?project=&from=&to=&kinds=`.
- `src/components/BudgetBar.tsx`, `src/components/TagPicker.tsx`, `src/components/AuditExport.tsx` (novos).
- `src/hooks/useDashboard.ts` — extensão pra `budgets`, `tags`, `tagFilter`, `notifyOnBudgetThreshold`.
- `shared/types.ts` — tipos `Budget`, `TagMap`, `AuditExport`.

**Persistência:**
- `~/.claude/watch/budgets.json` — `{ [projectKey]: { monthly: number, alertThreshold: number, rolloverDay: 1 } }`
- `~/.claude/watch/tags.json` — `{ [projectKey]: string[] }`

**Token cost:** zero. Pure aggregation + local FS.

---

### Fase 1 — Canvas espacial (Maestri DNA) — **prioridade 2**

Substitui/aumenta dashboard atual com canvas infinito React Flow mostrando TODOS os projetos simultaneamente.

**Features:**
- Cada projeto = card grande no canvas (token total, cost, live indicator, mini-choreo de subagents).
- Subagentes ativos faz fanout dentro do card.
- Pan/zoom nativo (já temos React Flow).
- **Andares** — grupos visuais por ancestral comum do `cwd`. Ex: tudo abaixo de `Desktop/milennials/` colapsa em um andar `Milennials`. User pode renomear, fold/unfold. Persistido em `floors.json`.
- Sessão histórica vs ativa — opacidade diferente (já temos `isLive`).
- Filtro por tag (Fase 2) integra aqui.

**Arquivos:**
- `src/components/SpatialCanvas.tsx` (novo) — canvas React Flow mostrando todos os projetos.
- `src/components/ProjectCard.tsx` (novo) — node card com mini-choreo embutido.
- `src/components/CenterPanel.tsx` — adicionar tab `Canvas` ao lado das atuais.
- `src/hooks/useDashboard.ts` — `floorFilter`, `floors`, layout positions persistidos.
- `server/governance.ts` — adicionar `floors.json`.

**Persistência:**
- `~/.claude/watch/floors.json` — `{ [floorId]: { name, projectKeys[] } }`
- `~/.claude/watch/canvas-layout.json` — `{ [projectKey]: { x, y } }` (posições manuais).

**Token cost:** zero.

---

### Fase 3 — Anotação editorial — **prioridade 3**

Overlay editorial em cima do canvas. Maestri sticky notes + leve scribble.

**Features:**
- **Sticky notes ancorados** a projeto / session / agent. Markdown renderizado. Persistido local.
- **Comentários temporais** — anotar "às 14:32 deu OOM" e mostrar no Scrubber existente.
- **Scribble layer (opcional)** — avaliar `react-sketch-canvas` (~30kb). Se aceitável, salva como SVG inline no JSON.

**Arquivos:**
- `src/components/AnnotationLayer.tsx` (novo).
- `src/components/StickyNote.tsx` (novo).
- `src/components/ScrubberAnnotations.tsx` (novo, integra com Scrubber existente).
- `server/governance.ts` — adicionar `notes.json`.

**Persistência:**
- `~/.claude/watch/notes.json` — `{ [id]: { anchor: { kind, key }, body, ts, color? } }`

**Token cost:** zero.

---

## O que NÃO entra (preserva charter passive)

- ❌ **Agent-to-agent PTY** (Maestri) — requer interceptação ativa de stdin/stdout. Quebra read-only.
- ❌ **Throttling de spend** (Paperclip) — requer hook bloqueante que injeta abort. Consome tokens via injeção de contexto.
- ❌ **Heartbeats que spawnam agents** (Paperclip) — usa tokens do usuário automaticamente. Recomendar `/schedule` Claude Code nativo se usuário quiser.
- ❌ **"Bring-your-own-agent" routing** — discutido e rejeitado pelo dono em conversa anterior.

---

## Padrão único de persistência

Tudo em `~/.claude/watch/`:

```
budgets.json        // Fase 2
tags.json           // Fase 2
floors.json         // Fase 1
canvas-layout.json  // Fase 1
notes.json          // Fase 3
```

Nenhum desses arquivos sai da máquina. Nenhum injeta no contexto Claude. Nenhum requer auth.

`server/governance.ts` (criado na Fase 2) centraliza a leitura/escrita atômica via `fs.promises.writeFile` + `rename` pattern pra evitar corrupção em crash.

---

## Branch strategy

Branch principal: `main` (sempre verde, deploy-ready).

Branches de feature, uma por fase, criadas todas upfront pra estruturar o GitHub:

- `feat/phase-2-governance` — começa primeiro
- `feat/phase-1-canvas` — começa após phase 2 mergear
- `feat/phase-3-annotations` — última

Cada fase termina em PR pra `main` com:
- Demo screenshots (cada feature visível)
- Test pass (vitest 6/6 + novos testes da fase)
- `npx tsc --noEmit` clean
- Sem novos deps que custem mais que ~50kb gzipped

Tags semânticas após cada merge: `v0.2.0` (Fase 2), `v0.3.0` (Fase 1), `v0.4.0` (Fase 3).

---

## Verificação end-to-end (por fase)

**Fase 2:**
1. `npm run dev`
2. Abrir UI, definir budget num projeto via TagPicker/BudgetBar
3. Confirmar persistência em `~/.claude/watch/budgets.json`
4. Atribuir tags e filtrar canvas — projeto certo é mostrado/ocultado
5. Exportar audit — NDJSON baixado contém eventos do range certo
6. `npm test` 6/6 + testes novos do governance.ts
7. TokenMeter inalterado (zero token cost)

**Fase 1:**
1. UI mostra todos os projetos no canvas, pan/zoom funcional
2. Drag/drop pra reposicionar — posição persiste após reload
3. Andar agrupando `Desktop/milennials/*` aparece colapsável
4. Sessão idle vs live tem opacidade distinta
5. Tests + tsc clean

**Fase 3:**
1. Sticky note ancorado num projeto persiste reload
2. Comentário temporal aparece no Scrubber
3. Tests + tsc clean

---

## Critical files reference

- `server/watcher.ts:134-216` — `buildSnapshot` é onde injeções de governança/tags entram (lê de `~/.claude/watch`).
- `server/jsonl-parser.ts:265-350` — onde events são gerados (audit log existe daqui).
- `server/paths.ts:10-11` — `WATCH_DIR` já definido, base pra todos os JSONs locais.
- `src/hooks/useDashboard.ts` — store zustand com persist, ponto de extensão pra tags/budgets/floors.
- `src/components/CenterPanel.tsx` — tabs onde Canvas vai entrar na Fase 1.
- `src/components/Choreography.tsx` — base pra ProjectCard mini-choreo.
