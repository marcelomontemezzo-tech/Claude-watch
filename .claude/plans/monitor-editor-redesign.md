# Redesign — Monitor + Editor

## Context

Reescopa o sistema em duas abas top-level:

- **Monitor** — observação simplificada. Choreography é hero. Demais painéis viram drawers/modais opcionais.
- **Editor** — Maestri-like. Canvas espacial dos subagents do projeto + edit pane lateral. Edição definitiva: writes diretos no FS pra `.claude/agents/*.md`, `.claude/skills/<n>/SKILL.md` e Obsidian notes.

Restrições mantidas:
- **Não diminuir o poder de harness**: Editor edita de verdade, sem restringir capacidade do user.
- **Não aumentar consumo de tokens**: claude-watch continua passive read-only no JSONL. Writes de subagent atingem só os arquivos `.md` em disco (que o user faria à mão de qualquer jeito).

Branch: `feat/redesign-monitor-editor` off `main`. PR #1 (Phase 2 governance) fica isolado pro user decidir merge.

---

## Decisões tomadas

1. **Phase 2 governance** — não entra nessa branch. Fica em PR #1 separado.
2. **Obsidian** — auto-detect em `<cwd>/Obsidian/**/*.md` por projeto (foi onde o vault apareceu no único projeto que tem).
3. **Writes no Editor** — ativos desde o start.
4. **Plugin agents/skills** — visíveis no Editor mas read-only (transparência sem mexer no cache).

---

## Backend

### `server/editor.ts` (novo)

- `scanEditorSources(projects)`: lista plana com items
  - **project skills**: `<cwd>/.claude/skills/<name>/SKILL.md` (editáveis)
  - **project agents**: `<cwd>/.claude/agents/*.md` (editáveis)
  - **global**: `~/.claude/{skills,agents}` (editáveis)
  - **plugin**: discoverPluginRoots → marcados readonly
  - **obsidian**: `<cwd>/Obsidian/**/*.md` (editáveis)
- `readEditorFile(absPath)`: validate path against whitelist; retorna `{ content, frontmatter, body, mtime }`
- `writeEditorFile(absPath, content)`: validate path; atomic write (`tmp` + `rename`); retorna read fresh
- **Whitelist** (deny tudo que não bate):
  - Sob qualquer `cwd` conhecido (vindo de `lastSnapshot.projects`) + `/.claude/agents` ou `/.claude/skills`
  - Sob `~/.claude/agents` ou `~/.claude/skills`
  - Sob `<cwd>/Obsidian/`
  - Negar plugins cache (read-only)

### Endpoints novos em `server/index.ts`

- `GET /api/editor/sources` → array de `EditorSource`
- `GET /api/editor/file?path=` → `EditorFile`
- `PUT /api/editor/file` body `{ path, content }` → `EditorFile`

### Tipos novos em `shared/types.ts`

```ts
export interface EditorSource {
  id: string;
  name: string;
  kind: "agent" | "skill" | "obsidian";
  source: "project" | "global" | "plugin" | "obsidian";
  pluginName?: string;
  projectKey?: string;
  projectCwd?: string;
  filePath: string;
  readonly: boolean;
  description?: string;
  mtimeMs: number;
}

export interface EditorFile {
  source: EditorSource;
  content: string;
  frontmatter: Record<string, string>;
  body: string;
}
```

---

## Frontend

### Top-level tabs

- `useDashboard.ts` ganha `topTab: "monitor" | "editor"` (persistido).
- Header novo simplificado em `App.tsx`: wordmark + Monitor/Editor toggle + connection dot.
- AgentModal continua global.

### `MonitorPage.tsx` (novo)

Layout:

```
┌─ TopBar ──────────────────────────────────────┐
│ wordmark · [Monitor | Editor] · status        │
├─ Sidebar compacta ─┬─ CHOREO HERO ────────────┤
│ project list mini   │  React Flow full-bleed  │
│ (dot · name · cost) │                          │
│                     │                          │
└─ drawer toggles ────┴──────────────────────────┘
   tokens | timeline | agents (drawer panes opcionais)
```

- Sidebar **compacta**: só dot + nome + tokens compactos. Sem govern/budget/tags. Clique seleciona.
- **Choreography** ocupa 100% do central, full-bleed.
- 3 drawer toggles na bottom-bar: tokens, timeline, agents — cada um abre painel sobreposto à direita ou rodapé. Default fechados.

### `EditorPage.tsx` (novo)

Layout 3 colunas:

```
┌─ TopBar ──────────────────────────────────────┐
├─ Source List ─┬─ Canvas ──┬─ Edit Pane ───────┤
│ filters       │ React     │ frontmatter form  │
│ search        │ Flow grid │ body textarea     │
│ list items    │ of items  │ save · revert     │
└───────────────┴───────────┴───────────────────┘
```

- **Source List** (esquerda, ~240px): tabs filtro [project / global / plugin / obsidian] + search + lista virtualizada.
- **Canvas** (centro): React Flow com nodes-card representando cada source filtrado. Drag persiste posição em `~/.claude/watch/editor-layout.json`. Clique no node = seleciona pra editar.
- **Edit Pane** (direita, ~480px): header (filePath truncado), inputs de frontmatter (`name`, `description`, etc descobertos), textarea grande pro body, botões `Save` / `Revert`. Plugin sources abrem em modo readonly (textarea disabled + badge).

### Reuso

- `Choreography.tsx`: usado direto no Monitor sem mudança.
- `EventTimeline.tsx`, `AgentRoster.tsx`, `TokenMeter.tsx`: viram filhos de drawers no Monitor.

---

## Persistência local (zero tokens)

- `~/.claude/watch/editor-layout.json` — `{ [sourceId]: { x, y } }`
- Top tab + última seleção do Editor: zustand persist.

---

## Charter

- **Harness**: Editor permite full-edit de skills/agents e Obsidian. Não restringe.
- **Tokens**: zero adicional. Tudo são leituras/escritas em FS local. Nenhum prompt injetado.

---

## Critical files

### Novos
- `server/editor.ts`
- `src/components/MonitorPage.tsx`
- `src/components/EditorPage.tsx`
- `src/components/EditorSourceList.tsx`
- `src/components/EditorCanvas.tsx`
- `src/components/EditorPane.tsx`
- `src/components/TopTabs.tsx`

### Modificados
- `shared/types.ts` — EditorSource, EditorFile
- `server/index.ts` — endpoints `/api/editor/*`
- `src/App.tsx` — top tabs + page switch
- `src/hooks/useDashboard.ts` — topTab + editor selection state

---

## Verification

1. `npm run dev`, http://localhost:1788
2. Monitor: choreography hero ocupa central, sidebar compacta lista projetos, sem ruído
3. Editor: source list à esquerda mostra `agent-*` skills do v8, plugin entries marcadas readonly
4. Click num skill no canvas → edit pane carrega frontmatter + body
5. Edita body, Save → arquivo `.md` em disco recebe write atômico
6. Revert restaura conteúdo original do disk
7. Plugin source: edit pane mostra badge "read-only", textarea disabled
8. Obsidian: notes do `<cwd>/Obsidian/...` aparecem editáveis
9. `npm test` 6/6 + novos testes do editor (whitelist + write atomic)
10. `npx tsc --noEmit` clean
11. TokenMeter sem aumento (zero token cost)
