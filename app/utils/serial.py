import json
from datetime import date, datetime
from decimal import Decimal


def limpiar(fila):
    """Convierte una fila de BD a tipos JSON simples (fechas ISO, números, listas)."""
    if fila is None:
        return None
    out = {}
    for k, v in dict(fila).items():
        if isinstance(v, Decimal):
            v = float(v)
        elif isinstance(v, datetime):
            v = v.isoformat(sep=" ", timespec="seconds")
        elif isinstance(v, date):
            v = v.isoformat()
        out[k] = v
    if "servicios" in out:
        try:
            lista = json.loads(out["servicios"] or "[]")
            out["servicios"] = lista if isinstance(lista, list) else []
        except (ValueError, TypeError):
            out["servicios"] = []
    return out
