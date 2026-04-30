# Milennials · Agent Runner

Interface desktop local que orquestra um pipeline de AI agents para resolver tasks de desenvolvimento. Sem n8n. Você descreve uma task, o pipeline spawna os agents certos em sequência, terminais mostram output em tempo real, e o resultado final é uma PR aberta no GitHub com documentação no vault.

## Pipeline

```
Intake → Orchestrator → Prompt Engineer → [Frontend | Backend | Prompt Eng. Exec] → QA → Versioner
                                                                                       ↑
                                                                 (fix loop, máx 2 tentativas)
```

Stage 7 (Retrospective) roda fora do pipeline principal, semanal.

## Estrutura

```
agent-runner/
  frontend/           Vite + React (interface)
  backend/            Node + Express + WebSocket (orquestração)
  agents/prompts/     System prompts dos 7 agents

vault/                Estado compartilhado em markdown (Obsidian-friendly)
  tasks/              inbox → planning → ready → in-progress → done → fix → qa_approved → versioned
  context/standards/  Regras globais
  context/clients/    Particularidades por cliente
  memory/             Documentação por fix/feat/decisão/padrão
  handoffs/           Mensagens entre agents
  errors/             Falhas escaladas

projects/
  torque/  copilot/  devtrack/   Cada um com context/ e tasks/
```

## Pré-requisitos

```bash
node -v   # >= 20

# CLIs dos agents
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex

# Auth (uma vez)
claude auth
codex auth
```

## Setup

```bash
# Backend
cd agent-runner/backend
npm install

# Frontend
cd ../frontend
npm install
```

## Rodar

Em dois terminais:

```bash
# Terminal 1 — backend (porta 5174, WS em /ws)
cd agent-runner/backend
npm run dev

# Terminal 2 — frontend (porta 5173, proxy para o backend)
cd agent-runner/frontend
npm run dev
```

Abra `http://localhost:5173`.

## Testar pipeline sem UI

```bash
cd agent-runner/backend
node src/cli.js "Adicionar campo temperatura no card de lead com fallback morno quando null" torque
```

Os arquivos vão sendo escritos em `vault/tasks/...`. Acompanhe pelo Obsidian apontando para `./vault`.

## Schema de uma task

```markdown
---
id: TASK-20260430-1234
status: ready
agent: frontend
model: claude-opus-4-7
project: torque
priority: high
token_budget: 6000
context_files:
  - vault/context/standards/react-components.md
  - projects/torque/context/architecture.md
---

## Objetivo
[descrição precisa]

## Critério de conclusão
- [ ] item verificável

## Output esperado
[formato exato do artefato final]
```

## Variáveis de ambiente (opcional)

| Var      | Default | Descrição                       |
|----------|---------|---------------------------------|
| `PORT`   | 5174    | Porta HTTP/WS do backend        |

## Convenções

| Item    | Padrão                                       |
|---------|----------------------------------------------|
| Branch  | `[tipo]/TASK-[id]-[slug-kebab]`              |
| Commit  | `[tipo](escopo): descrição em pt-BR`         |
| Tipos   | `fix \| feat \| refactor \| prompt \| docs`  |

## Modelos por agent

| Agent          | Modelo              | Contexto | Output |
|----------------|---------------------|----------|--------|
| Intake         | claude-sonnet-4-6   | 1.000    | 500    |
| Orchestrator   | claude-sonnet-4-6   | 2.000    | 1.000  |
| Prompt Eng.    | claude-sonnet-4-6   | 3.000    | 2.000  |
| Frontend       | claude-opus-4-7     | 8.000    | 4.000  |
| Backend        | codex (gpt)         | 6.000    | 3.000  |
| QA             | claude-sonnet-4-6   | 4.000    | 1.500  |
| Versioner      | claude-sonnet-4-6   | 2.000    | 1.500  |

## Próximos passos

- [ ] Subir Retrospective como cron semanal
- [ ] Adicionar persistência de runs (DevTrack)
- [ ] Cache de contexto por projeto
- [ ] Hot-reload de system prompts sem restart
