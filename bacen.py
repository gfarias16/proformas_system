from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any
from urllib.error import HTTPError
from urllib.request import urlopen

PTAX_BASE_URL = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/"


def _format_bacen_date(value: date) -> str:
    return value.strftime("%m-%d-%Y")


def _fetch_json(url: str) -> dict[str, Any]:
    with urlopen(url, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def get_latest_usd_brl(days_back: int = 7) -> dict[str, Any]:
    today = date.today()

    for offset in range(days_back + 1):
        target_date = today - timedelta(days=offset)
        formatted_date = _format_bacen_date(target_date)
        url = (
            f"{PTAX_BASE_URL}"
            "CotacaoDolarDia(dataCotacao=@dataCotacao)"
            f"?@dataCotacao='{formatted_date}'&$top=100&$format=json"
        )
        try:
            payload = _fetch_json(url)
        except HTTPError:
            continue
        values = payload.get("value", [])
        if not values:
            continue

        item = values[0]
        data_hora = item.get("dataHoraCotacao")
        try:
            atualizado_em = datetime.fromisoformat(str(data_hora).replace("Z", "+00:00")).isoformat()
        except ValueError:
            atualizado_em = str(data_hora)

        return {
            "fonte": "Banco Central do Brasil - PTAX",
            "moeda": "USD",
            "cotacao_compra": item.get("cotacaoCompra"),
            "cotacao_venda": item.get("cotacaoVenda"),
            "tipo_boletim": item.get("tipoBoletim"),
            "data_consulta": target_date.isoformat(),
            "atualizado_em": atualizado_em,
        }

    raise RuntimeError("Não foi possível obter a cotação PTAX do dólar nos últimos dias.")
