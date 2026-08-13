# Regras de negócio

## Regras identificadas

- Novas informações são cadastradas pela interface/API; a planilha não é necessária para iniciar.
- Importação histórica é opcional e executada manualmente.
- Solicitações de mudança possuem fluxos distintos de aprovação e rejeição.
- Conversões usam a cotação USD-BRL obtida pela integração PTAX.
- Dados persistem no volume PostgreSQL.

Critérios de aprovação, perfis autorizados, precisão monetária, data de referência da PTAX e tratamento de duplicidades da importação: **A confirmar**.
