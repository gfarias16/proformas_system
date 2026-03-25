from __future__ import annotations

import pandas as pd
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from db import ProformaRecord, create_schema, get_session
from unificar_abas import build_dataframe, export_files


def clean_scalar(value):
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    if isinstance(value, bool):
        return bool(value)
    return value


def import_dataframe(df: pd.DataFrame) -> int:
    create_schema()
    rows = [{column: clean_scalar(value) for column, value in record.items()} for record in df.to_dict("records")]
    if not rows:
        return 0

    updatable_columns = [column.name for column in ProformaRecord.__table__.columns if column.name not in {"id", "created_at"}]
    statement = insert(ProformaRecord).values(rows)
    statement = statement.on_conflict_do_update(
        index_elements=[ProformaRecord.registro_id],
        set_={column: getattr(statement.excluded, column) for column in updatable_columns if column != "registro_id"},
    )

    with get_session() as session:
        session.execute(statement)
    return len(rows)


def seed_database_if_empty() -> int:
    create_schema()
    with get_session() as session:
        existing = session.execute(select(ProformaRecord.id).limit(1)).first()
    if existing:
        return 0

    df = build_dataframe()
    try:
        export_files(df)
    except PermissionError:
        pass
    return import_dataframe(df)


def main() -> None:
    df = build_dataframe()
    try:
        export_files(df)
    except PermissionError:
        print("Aviso: não foi possível atualizar os arquivos exportados porque um deles está aberto.")
    total = import_dataframe(df)
    print(f"{total} registros importados para o PostgreSQL.")


if __name__ == "__main__":
    main()
