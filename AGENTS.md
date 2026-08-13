# AGENTS.md — Sistema de Proformas

## Escopo e objetivo

Este arquivo vale para todo o projeto `proformas`. O sistema mantém proformas, clientes, usuários e solicitações de mudança, consulta/converte câmbio PTAX e exporta relatórios. A planilha histórica é uma carga opcional, não uma dependência da inicialização normal.

## Stack e estrutura principal

- Backend Python com FastAPI, SQLAlchemy e `psycopg2`.
- Frontend React 18 com Vite.
- PostgreSQL 17.
- pandas e openpyxl para importação/relatórios Excel.
- `api.py`: endpoints e orquestração HTTP.
- `db.py`: conexão e schema/persistência.
- `bacen.py`: integração PTAX/Bacen.
- `reporting.py`: geração de relatórios.
- `importar_para_postgres.py` e `unificar_abas.py`: fluxo legado/manual de planilhas.
- `frontend/`: interface React.
- `docker/`: Dockerfiles da API e frontend.

## Execução, serviços e portas

```bash
docker-compose up --build -d db api frontend
```

- `db`: PostgreSQL 17, porta host `5432`, volume `postgres_data`.
- `api`: FastAPI na porta `8000`; docs em `/docs`, health em `/health`.
- `frontend`: Vite na porta `5173`, com proxy interno para `api:8000`.

Não há Compose separado de desenvolvimento/produção identificado: **A confirmar**.

## Testes e validação

Não foram encontrados testes automatizados nem CI/CD. Validação mínima do frontend:

```bash
cd frontend
npm run build
```

Antes de concluir:

1. Valide `/health` e o schema OpenAPI.
2. Teste listagem/criação de proformas, clientes, usuários e fluxo completo de aprovação/rejeição.
3. Teste PTAX com sucesso, timeout, data sem cotação e resposta inválida.
4. Gere e abra o XLSX de relatório, conferindo datas, moeda, totais e encoding.
5. Valide loading, vazio, erro e responsividade do frontend.
6. Não execute a importação legada como validação comum.

## Regras importantes

- `importar_para_postgres.py` altera o banco e deve ser executado apenas uma vez por ambiente quando explicitamente autorizado, após backup e ensaio em cópia.
- A planilha original e arquivos `.env` podem conter dados comerciais/sensíveis; não os exponha em logs ou commits.
- Operações financeiras devem usar `Decimal`/precisão definida; evite `float` para valores persistidos ou totalizações.
- Datas e cotações PTAX precisam guardar referência/origem; não substitua silenciosamente uma cotação ausente.
- Aprovação e rejeição devem ser transacionais e impedir processamento duplicado.
- Mudanças de schema exigem estratégia de migração/rollback. Ferramenta de migrations não foi identificada: **A confirmar**.
- O Compose contém credenciais locais padrão; não use esses padrões em produção.
- Atualizações de pandas/openpyxl podem mudar leitura/escrita de planilhas; valide com amostras controladas.
- Comente regras financeiras e transformações de dados pelo motivo e pela origem.

## Áreas críticas

- `db.py` por conexão e schema.
- `api.py` por regras e contrato HTTP.
- `bacen.py` por dependência externa.
- `reporting.py`, `importar_para_postgres.py` e `unificar_abas.py` por integridade dos dados.
- `docker-compose.yml`, `docker/` e volume `postgres_data`.
- `frontend/src/` e proxy da API.

Autenticação/autorização, migrations formais, testes e procedimento de produção estão **A confirmar**.

## Contexto do projeto

Antes de alterações relevantes, consulte quando existirem:

- `docs/CONTEXTO.md`
- `docs/STATUS.md`
- `docs/ARQUITETURA.md`
- `docs/REGRAS_NEGOCIO.md`
- `docs/DECISOES.md`
- `docs/TROUBLESHOOTING.md`

Após alterações relevantes, avalie se essa documentação precisa ser atualizada.
