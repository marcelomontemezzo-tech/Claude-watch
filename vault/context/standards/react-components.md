---
escopo: frontend/react
versao: 1
---

# Padrões — componentes React

## Estrutura
- Componente funcional, hooks. TypeScript onde o projeto usa.
- Um componente por arquivo. PascalCase.
- Props tipadas. Sem `any` sem comentário justificando.

## Estados
Toda view com dados externos cobre quatro estados:
- `loading`: skeleton ou indicador discreto, nunca spinner em tela cheia exceto bootstrap.
- `empty`: mensagem útil + CTA quando aplicável.
- `error`: mensagem clara, ação de retry quando faz sentido.
- `success`: caminho feliz.

## Performance
- `useMemo` para objetos passados como prop a children memoizados.
- `useCallback` para handlers passados a listas.
- `key` estável (não use index quando a lista reordena).
- Lazy-load rotas (`React.lazy`) e imagens grandes.

## A11y
- `<button>` para ações. `<a>` para navegação.
- `aria-label` em ícones-only.
- Foco visível. Não sobrescreva outline sem substituto.
- Contraste mínimo AA.

## Estilo
- Tailwind ou CSS modules — siga a convenção do projeto.
- Tokens de design (cores, espaçamento, raio) vêm de variáveis. Não hardcode.
- Animações: 120–220ms, curva natural.
