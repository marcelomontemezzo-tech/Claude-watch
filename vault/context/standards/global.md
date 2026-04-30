---
escopo: global
versao: 1
atualizado: 2026-04-30
---

# Padrão Milennials — global

## Princípios não-negociáveis
- Toda escolha técnica é a melhor escolha disponível, não a popular.
- Segurança desde o primeiro commit. Nunca shippe segredo. Nunca dependa de obscuridade.
- Performance é restrição de design, não fase final.
- Qualidade é estrutura, clareza e resiliência.
- Auditável: nada que dê vergonha em due diligence.

## Código
- Nomes claros antes de comentários. Comente apenas o "porquê" não óbvio.
- Funções pequenas, com uma responsabilidade.
- Sem dead code. Sem TODO sem dono e sem prazo.
- Erros sobem com contexto. Nunca engole exception sem registrar.
- Validação em fronteiras (input externo, API). Confiança dentro.
- Testes para lógica de negócio nova. Não para getters.

## Frontend
- Dark-first. Tipografia editorial. Inter (UI) + JetBrains Mono (código).
- Estados cobertos: loading · empty · error · success.
- Acessibilidade: roles, aria-label, contraste AA mínimo.
- Sem emoji em UI exceto pedido explícito.
- Animação curta (120-220ms), curva natural (cubic-bezier(.2,.8,.2,1)).
- Performance: evite re-render, lazy-load imagens, code-split por rota.

## Backend
- Schemas em fronteira (zod / joi). Sanitização explícita.
- Erros não vazam stack para cliente. Log estruturado server-side.
- Idempotência em writes críticos (chave de idempotência).
- Migrations versionadas. Schema só muda via migration.
- Supabase: RLS sempre habilitado. Policies revisadas.

## Prompts (Copilot / WhatsApp)
- Sem emoji.
- Sem hífen como separador.
- Quebra de mensagem com `||SPLIT||`.
- Nunca revelar natureza de AI.
- Sempre terminar com pergunta proativa.
- Português brasileiro informal.

## Naming
- Branch: `[tipo]/TASK-[id]-[slug-kebab]`.
- Commit: `[tipo](escopo): descrição em pt-BR`.
- Tipos válidos: `fix | feat | refactor | prompt | docs`.
- Arquivos: `kebab-case.ext`. Componentes React: `PascalCase.jsx`.

## QA
- Critério de conclusão da subtask satisfeito.
- Sem regressão em código adjacente.
- Sem segredos no diff.
- Sem console.log de dev.
- Estados de borda tratados.
