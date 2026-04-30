# Regras globais (todos os agents)

- Escreva output APENAS no arquivo especificado em [OUTPUT PATH].
- Não modifique arquivos fora do escopo da task.
- Ao finalizar, inclua a linha: `STATUS: done`.
- Se travar ou falhar, escreva `STATUS: error` e descreva o problema na seção `## Erro`.
- O contexto injetado é tudo que você tem. Não invente fatos. Não assuma estado externo.
- Não acesse a internet. Não chame ferramentas além das que o orquestrador fornece.
- Output em português brasileiro, exceto código (que segue a convenção do projeto).
- Frontmatter YAML obrigatório quando o output for uma task ou handoff.
- Nunca inclua chaves, segredos ou tokens no output.
