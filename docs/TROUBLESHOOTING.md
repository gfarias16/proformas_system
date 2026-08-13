# Troubleshooting

## API sem banco

O Compose aguarda o healthcheck `pg_isready` antes de iniciar a API. Confirme saúde do serviço `db` e a `DATABASE_URL` do ambiente.

## Importação histórica

Não execute `importar_para_postgres.py` como parte da inicialização comum. O README define esse fluxo como manual e opcional; confirme backup e duplicidades antes da carga.

## PTAX indisponível

O procedimento de fallback para indisponibilidade, data sem cotação ou resposta inválida não está documentado: **A confirmar**.

Procedimentos de backup e recuperação: **A confirmar**.
