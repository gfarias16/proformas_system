from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


def load_local_env() -> None:
    env_file = Path(".env")
    if not env_file.exists():
        return

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_local_env()


def get_database_url() -> str:
    return os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://postgres:postgres@localhost:5432/proformas",
    )


engine = create_engine(get_database_url(), future=True)
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    future=True,
)


class Base(DeclarativeBase):
    pass


class ProformaRecord(Base):
    __tablename__ = "proformas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    registro_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    origem_aba: Mapped[str | None] = mapped_column(String(100), index=True)
    origem_linha: Mapped[int | None] = mapped_column(Integer)
    proforma: Mapped[str] = mapped_column(String(100), index=True)
    data: Mapped[datetime | None] = mapped_column(DateTime)
    cliente: Mapped[str | None] = mapped_column(String(255), index=True)
    cnpj: Mapped[str | None] = mapped_column(String(50))
    contrato_po: Mapped[str | None] = mapped_column(String(255))
    po_rm_pedido: Mapped[str | None] = mapped_column(String(255))
    ordem_venda: Mapped[str | None] = mapped_column(String(255))
    nf: Mapped[str | None] = mapped_column(String(255))
    data_nf: Mapped[datetime | None] = mapped_column(DateTime)
    mes_contabil: Mapped[str | None] = mapped_column(String(50), index=True)
    observacoes: Mapped[str | None] = mapped_column(Text)
    bu: Mapped[str | None] = mapped_column(String(100), index=True)
    details: Mapped[str | None] = mapped_column(Text)
    well_project: Mapped[str | None] = mapped_column(String(255))
    valor_bruto_brl: Mapped[float | None] = mapped_column(Float)
    valor_bruto_usd: Mapped[float | None] = mapped_column(Float)
    valor_faturado_brl: Mapped[float | None] = mapped_column(Float)
    valor_liquido_brl: Mapped[float | None] = mapped_column(Float)
    impostos: Mapped[float | None] = mapped_column(Float)
    percentual_impostos: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str | None] = mapped_column(String(100), index=True)
    variacao_faturamento: Mapped[str | None] = mapped_column(Text)
    comentarios_variacao: Mapped[str | None] = mapped_column(Text)
    cl: Mapped[str | None] = mapped_column(String(100))
    enviado_cliente_em: Mapped[datetime | None] = mapped_column(DateTime)
    tem_dado_incompleto: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    valor_total_considerado: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class ChangeRequest(Base):
    __tablename__ = "change_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    proforma_record_id: Mapped[int | None] = mapped_column(Integer, index=True)
    proforma: Mapped[str] = mapped_column(String(100), index=True)
    campo: Mapped[str] = mapped_column(String(100))
    valor_atual: Mapped[str | None] = mapped_column(Text)
    novo_valor: Mapped[str] = mapped_column(Text)
    origem_aba: Mapped[str | None] = mapped_column(String(100))
    origem_linha: Mapped[int | None] = mapped_column(Integer)
    status_solicitacao: Mapped[str] = mapped_column(String(50), default="PENDENTE_REVISAO")
    comando_original: Mapped[str | None] = mapped_column(Text)
    requested_by: Mapped[str | None] = mapped_column(String(120))
    reviewed_by: Mapped[str | None] = mapped_column(String(120))
    review_notes: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    cnpj: Mapped[str | None] = mapped_column(String(50))
    contato: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    telefone: Mapped[str | None] = mapped_column(String(50))
    observacoes: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class AppUser(Base):
    __tablename__ = "app_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255))
    perfil: Mapped[str] = mapped_column(String(50), default="analista", nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


def create_schema() -> None:
    Base.metadata.create_all(bind=engine)
    upgrade_schema()


def upgrade_schema() -> None:
    statements = [
        "ALTER TABLE IF EXISTS change_requests ADD COLUMN IF NOT EXISTS proforma_record_id INTEGER",
        "ALTER TABLE IF EXISTS change_requests ADD COLUMN IF NOT EXISTS requested_by VARCHAR(120)",
        "ALTER TABLE IF EXISTS change_requests ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(120)",
        "ALTER TABLE IF EXISTS change_requests ADD COLUMN IF NOT EXISTS review_notes TEXT",
        "ALTER TABLE IF EXISTS change_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP",
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


@contextmanager
def get_session() -> Session:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
