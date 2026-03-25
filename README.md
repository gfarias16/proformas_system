# Sistema de Proformas

Sistema com PostgreSQL, API em FastAPI e frontend em React.

## Stack atual

- PostgreSQL
- FastAPI
- React + Vite
- Docker Compose

## Subir com Docker

Na raiz do projeto:

```bash
docker-compose up --build -d db api frontend
```

Aplicações:

- Frontend React: `http://localhost:5173`
- API FastAPI: `http://localhost:8000`
- Docs da API: `http://localhost:8000/docs`
- PostgreSQL: `localhost:5432`

## Funcionamento atual

- O sistema sobe usando apenas banco + API + frontend.
- A API não depende mais da planilha Excel para iniciar.
- Novos dados devem ser cadastrados manualmente pela interface ou pela API.
- Os dados persistem no volume Docker `postgres_data`.

## Importação inicial legada

Se você ainda quiser importar a planilha antiga uma única vez, rode manualmente:

```bash
python importar_para_postgres.py
```

Esse passo é opcional e não faz parte da subida normal do projeto.

## Parar containers

```bash
docker-compose down
```

Para remover também o volume do banco:

```bash
docker-compose down -v
```

## Estrutura principal

- `db.py`: schema e conexão.
- `api.py`: API HTTP do sistema.
- `bacen.py`: integração com PTAX do Bacen.
- `reporting.py`: exportação de relatório Excel.
- `frontend/`: interface React.
- `docker-compose.yml`: orquestração dos containers.

## Arquivos legados de importação

- `unificar_abas.py`: normaliza o Excel.
- `importar_para_postgres.py`: importa os dados do Excel para o PostgreSQL sob demanda.
- `PROFORMAS 2026 (1).xlsx`: planilha original usada apenas para carga histórica.

## Conexão do banco

Dentro do Docker Compose, a API usa:

```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@db:5432/proformas
```

Para acessar o banco de fora do container, por exemplo no pgAdmin:

- Host: `localhost`
- Port: `5432`
- Database: `proformas`
- User: `postgres`
- Password: `postgres`
