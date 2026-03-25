from __future__ import annotations

from datetime import datetime
from io import BytesIO

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, select

from bacen import get_latest_usd_brl
from db import AppUser, ChangeRequest, Client, ProformaRecord, create_schema, get_session
from reporting import build_excel_report

app = FastAPI(title="Proformas API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateRecordPayload(BaseModel):
    proforma: str
    cliente: str | None = None
    bu: str | None = None
    mes_contabil: str | None = None
    status: str | None = "PENDENTE"
    observacoes: str | None = None
    details: str | None = None
    well_project: str | None = None
    valor_bruto_brl: float | None = None
    valor_liquido_brl: float | None = None
    origem_aba: str | None = "MANUAL"


class ChangeRequestPayload(BaseModel):
    proforma_record_id: int
    campo: str
    novo_valor: str
    requested_by: str | None = "api"


class ApprovalPayload(BaseModel):
    reviewed_by: str
    review_notes: str | None = None


class ClientPayload(BaseModel):
    nome: str
    cnpj: str | None = None
    contato: str | None = None
    email: str | None = None
    telefone: str | None = None
    observacoes: str | None = None


class UserPayload(BaseModel):
    nome: str
    email: str | None = None
    perfil: str = "analista"


class FxConvertPayload(BaseModel):
    amount: float
    direction: str = "USD_TO_BRL"


def records_to_df(records: list, model) -> pd.DataFrame:
    if not records:
        return pd.DataFrame()
    return pd.DataFrame(
        [{column.name: getattr(record, column.name) for column in model.__table__.columns} for record in records]
    )


def df_to_records(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []

    normalized = df.copy()
    normalized = normalized.astype(object)
    normalized = normalized.where(pd.notnull(normalized), None)

    for column in normalized.columns:
        normalized[column] = normalized[column].map(
            lambda value: value.isoformat() if hasattr(value, "isoformat") and not isinstance(value, str) else value
        )

    return normalized.to_dict("records")


def recompute_derived_fields(payload: dict) -> dict:
    payload["tem_dado_incompleto"] = any(not payload.get(field) for field in ["cliente", "mes_contabil", "bu"])
    payload["valor_total_considerado"] = (
        payload.get("valor_liquido_brl")
        or payload.get("valor_faturado_brl")
        or payload.get("valor_bruto_brl")
    )
    return payload


def convert_value(field: str, raw_value: str):
    if raw_value in (None, "", "None"):
        return None
    if field in {
        "valor_bruto_brl",
        "valor_bruto_usd",
        "valor_faturado_brl",
        "valor_liquido_brl",
        "impostos",
        "percentual_impostos",
    }:
        return float(raw_value)
    return raw_value


def get_records_df(
    mes_contabil: str | None = None,
    bu: str | None = None,
    cliente: str | None = None,
    status: str | None = None,
) -> pd.DataFrame:
    with get_session() as session:
        stmt = select(ProformaRecord)
        if mes_contabil:
            stmt = stmt.where(ProformaRecord.mes_contabil == mes_contabil)
        if bu:
            stmt = stmt.where(ProformaRecord.bu == bu)
        if cliente:
            stmt = stmt.where(ProformaRecord.cliente == cliente)
        if status:
            stmt = stmt.where(ProformaRecord.status == status)
        records = session.execute(stmt.order_by(ProformaRecord.id.desc())).scalars().all()
    return records_to_df(records, ProformaRecord)


@app.on_event("startup")
def startup() -> None:
    create_schema()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.get("/dashboard/summary")
def dashboard_summary() -> dict:
    df = get_records_df()
    if df.empty:
        return {"total_registros": 0, "total_clientes": 0, "total_bruto_brl": 0, "total_liquido_brl": 0, "pendencias": 0}

    return {
        "total_registros": len(df),
        "total_clientes": int(df["cliente"].nunique(dropna=True)),
        "total_bruto_brl": float(df["valor_bruto_brl"].sum(min_count=1) or 0),
        "total_liquido_brl": float(df["valor_liquido_brl"].sum(min_count=1) or 0),
        "pendencias": int(df["status"].fillna("").str.contains("PENDENTE|UNBILLED", case=False).sum()),
    }


@app.get("/fx/usd-brl/current")
def get_current_usd_brl() -> dict:
    try:
        return get_latest_usd_brl()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao consultar PTAX do Bacen: {exc}")


@app.post("/fx/usd-brl/convert")
def convert_usd_brl(payload: FxConvertPayload) -> dict:
    try:
        quote = get_latest_usd_brl()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao consultar PTAX do Bacen: {exc}")
    rate = quote.get("cotacao_venda") or quote.get("cotacao_compra")
    if not rate:
        raise HTTPException(status_code=502, detail="Cotação indisponível no momento.")

    if payload.direction == "BRL_TO_USD":
        converted = payload.amount / rate
    else:
        converted = payload.amount * rate

    return {
        "direction": payload.direction,
        "amount": payload.amount,
        "rate": rate,
        "result": converted,
        "quote": quote,
    }


@app.get("/proformas")
def list_proformas(
    mes_contabil: str | None = Query(default=None),
    bu: str | None = Query(default=None),
    cliente: str | None = Query(default=None),
    status: str | None = Query(default=None),
) -> list[dict]:
    return df_to_records(get_records_df(mes_contabil, bu, cliente, status))


@app.post("/proformas")
def create_proforma(payload: CreateRecordPayload) -> dict:
    record_data = {
        "registro_id": f"MANUAL::{payload.proforma}",
        "origem_aba": payload.origem_aba or "MANUAL",
        "origem_linha": None,
        "proforma": payload.proforma,
        "data": datetime.utcnow(),
        "cliente": payload.cliente,
        "mes_contabil": payload.mes_contabil,
        "bu": payload.bu,
        "status": payload.status,
        "observacoes": payload.observacoes,
        "details": payload.details,
        "well_project": payload.well_project,
        "valor_bruto_brl": payload.valor_bruto_brl,
        "valor_liquido_brl": payload.valor_liquido_brl,
        "valor_faturado_brl": None,
        "valor_bruto_usd": None,
        "impostos": None,
        "percentual_impostos": None,
        "cnpj": None,
        "contrato_po": None,
        "po_rm_pedido": None,
        "ordem_venda": None,
        "nf": None,
        "data_nf": None,
        "comentarios_variacao": None,
        "variacao_faturamento": None,
        "cl": None,
        "enviado_cliente_em": None,
    }
    record_data = recompute_derived_fields(record_data)

    with get_session() as session:
        session.add(ProformaRecord(**record_data))
    return {"message": "Registro criado com sucesso."}


@app.get("/change-requests")
def list_change_requests() -> list[dict]:
    with get_session() as session:
        requests = session.execute(select(ChangeRequest).order_by(desc(ChangeRequest.created_at))).scalars().all()
    return df_to_records(records_to_df(requests, ChangeRequest))


@app.post("/change-requests")
def create_change_request(payload: ChangeRequestPayload) -> dict:
    with get_session() as session:
        record = session.get(ProformaRecord, payload.proforma_record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Registro não encontrado.")

        old_value = getattr(record, payload.campo, None)
        session.add(
            ChangeRequest(
                proforma_record_id=record.id,
                proforma=record.proforma,
                campo=payload.campo,
                valor_atual="" if old_value is None else str(old_value),
                novo_valor=payload.novo_valor,
                origem_aba=record.origem_aba,
                origem_linha=record.origem_linha,
                status_solicitacao="PENDENTE_REVISAO",
                comando_original="solicitação via react",
                requested_by=payload.requested_by,
            )
        )
    return {"message": "Solicitação criada com sucesso."}


@app.post("/change-requests/{request_id}/approve")
def approve_change_request(request_id: int, payload: ApprovalPayload) -> dict:
    with get_session() as session:
        request = session.get(ChangeRequest, request_id)
        if not request:
            raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
        if request.status_solicitacao != "PENDENTE_REVISAO":
            raise HTTPException(status_code=400, detail="Solicitação já processada.")

        record = session.get(ProformaRecord, request.proforma_record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Registro não encontrado.")

        setattr(record, request.campo, convert_value(request.campo, request.novo_valor))
        updated_data = {
            column.name: getattr(record, column.name)
            for column in ProformaRecord.__table__.columns
        }
        updated_data = recompute_derived_fields(updated_data)
        record.tem_dado_incompleto = updated_data["tem_dado_incompleto"]
        record.valor_total_considerado = updated_data["valor_total_considerado"]

        request.status_solicitacao = "APROVADA"
        request.reviewed_by = payload.reviewed_by
        request.review_notes = payload.review_notes
        request.reviewed_at = datetime.utcnow()
    return {"message": "Solicitação aprovada com sucesso."}


@app.post("/change-requests/{request_id}/reject")
def reject_change_request(request_id: int, payload: ApprovalPayload) -> dict:
    with get_session() as session:
        request = session.get(ChangeRequest, request_id)
        if not request:
            raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
        if request.status_solicitacao != "PENDENTE_REVISAO":
            raise HTTPException(status_code=400, detail="Solicitação já processada.")

        request.status_solicitacao = "REJEITADA"
        request.reviewed_by = payload.reviewed_by
        request.review_notes = payload.review_notes
        request.reviewed_at = datetime.utcnow()
    return {"message": "Solicitação rejeitada com sucesso."}


@app.get("/clients")
def list_clients() -> list[dict]:
    with get_session() as session:
        clients = session.execute(select(Client).order_by(Client.nome)).scalars().all()
    return df_to_records(records_to_df(clients, Client))


@app.post("/clients")
def create_client(payload: ClientPayload) -> dict:
    with get_session() as session:
        session.add(
            Client(
                nome=payload.nome,
                cnpj=payload.cnpj,
                contato=payload.contato,
                email=payload.email,
                telefone=payload.telefone,
                observacoes=payload.observacoes,
                ativo=True,
            )
        )
    return {"message": "Cliente criado com sucesso."}


@app.get("/users")
def list_users() -> list[dict]:
    with get_session() as session:
        users = session.execute(select(AppUser).order_by(AppUser.nome)).scalars().all()
    return df_to_records(records_to_df(users, AppUser))


@app.post("/users")
def create_user(payload: UserPayload) -> dict:
    with get_session() as session:
        session.add(AppUser(nome=payload.nome, email=payload.email, perfil=payload.perfil, ativo=True))
    return {"message": "Usuário criado com sucesso."}


@app.get("/reports/proformas.xlsx")
def export_report(
    mes_contabil: str | None = Query(default=None),
    bu: str | None = Query(default=None),
    cliente: str | None = Query(default=None),
    status: str | None = Query(default=None),
) -> StreamingResponse:
    df = get_records_df(mes_contabil, bu, cliente, status)
    report_bytes = build_excel_report(df)
    filename = f"relatorio_proformas_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        BytesIO(report_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
