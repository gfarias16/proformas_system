# Arquitetura

## Componentes

- Frontend React/Vite.
- API FastAPI em `api.py`.
- Persistência/schema em `db.py`.
- Integração PTAX em `bacen.py`.
- Relatórios em `reporting.py`.
- Scripts legados `unificar_abas.py` e `importar_para_postgres.py`.
- PostgreSQL 17.

## Containers e portas

- `db`: `5432:5432`, volume `postgres_data`.
- `api`: `8000:8000`.
- `frontend`: `5173:5173`, proxy interno para `api:8000`.

## Fluxo

```text
React -> FastAPI -> PostgreSQL
               -> Bacen/PTAX
               -> relatório XLSX
planilha legada -> script manual -> PostgreSQL
```
