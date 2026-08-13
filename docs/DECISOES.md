# Decisões identificadas

## PostgreSQL como fonte principal

Estado identificado: a API inicia e opera sem a planilha; dados ficam no PostgreSQL.

Motivação documentada: remover a dependência da planilha na subida normal.

## Importação legada manual

Estado identificado: `importar_para_postgres.py` é um passo opcional e separado.

Motivação documentada: permitir carga histórica sem acoplar o runtime ao Excel.

## FastAPI e React

Estado identificado: API e interface estão em containers separados.

Motivação: **A confirmar**.

## Relatórios com pandas/openpyxl

Estado identificado: as bibliotecas suportam importação e exportação Excel.

Motivação: **A confirmar**.
