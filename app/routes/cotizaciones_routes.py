import json
from datetime import date, timedelta
from flask import Blueprint, request, jsonify
from database import query_one, query_all, execute_query
from app.utils.security import admin_required
from app.utils.serial import limpiar

cotizaciones_bp = Blueprint("cotizaciones", __name__, url_prefix="/api")

BASE = """
    SELECT c.*, s.creadoEn AS solCreada
    FROM COTIZACION c JOIN SOLICITUD_COTIZACION s ON c.idSolicitud = s.idSolicitud
"""


def _error(msg, codigo=400):
    return jsonify({"success": False, "error": msg}), codigo


def _salida(fila):
    """Fila de BD -> forma que usa el frontend (COT-2087, líneas, % de descuento, vigencia)."""
    r = limpiar(fila)
    datos = {}
    try:
        datos = json.loads(r.get("datos") or "{}")
    except ValueError:
        pass
    anio = str(r.get("solCreada") or "")[:4] or str(date.today().year)
    return {
        "id": f"COT-{2086 + int(r['idSolicitud'])}", "idCotizacion": r["idCotizacion"],
        "sol": f"RUM-{anio}-{int(r['idSolicitud']):04d}",
        "estado": datos.get("estado") or ("Generada" if r["estado"] == "Lista" else "Borrador"),
        "lineas": datos.get("lineas", []), "pct": datos.get("pct", 0),
        "valida": str(r["fechaVigencia"])[:10], "condiciones": r.get("condiciones") or "",
        "subtotal": r["subtotal"], "descuento": r.get("descuento") or 0, "total": r["total"],
        "actualizada": str(r.get("creadoEn") or ""),
    }


@cotizaciones_bp.route("/cotizaciones", methods=["GET"])
@admin_required
def listar_cotizaciones():
    filas = query_all(BASE + " ORDER BY c.idCotizacion")
    return jsonify({"success": True, "total": len(filas), "data": [_salida(f) for f in filas]}), 200


@cotizaciones_bp.route("/solicitudes/<int:id_solicitud>/cotizacion", methods=["PUT"])
@admin_required
def guardar_cotizacion(id_solicitud):
    """RF07 (condicional): crea o actualiza la cotización de una solicitud (subtotal, descuento, total, vigencia)."""
    if not query_one("SELECT idSolicitud FROM SOLICITUD_COTIZACION WHERE idSolicitud = %s", (id_solicitud,)):
        return _error("Solicitud no encontrada.", 404)
    d = request.get_json() or {}

    lineas = d.get("lineas")
    if not isinstance(lineas, list) or not lineas:
        return _error("La cotización necesita al menos una línea.")
    subtotal = 0.0
    limpias = []
    for l in lineas:
        try:
            cant, unit = int(l.get("cant")), float(l.get("unit"))
        except (TypeError, ValueError, AttributeError):
            return _error("Cada línea necesita cantidad y valor unitario numéricos.")
        if cant < 1 or unit < 0:
            return _error("Cantidad mínima 1 y valor unitario no negativo.")
        subtotal += cant * unit
        limpias.append({**{k: l[k] for k in ("t", "id", "concepto") if k in l}, "cant": cant, "unit": unit})

    try:
        pct = float(d.get("pct", 0) or 0)
    except (TypeError, ValueError):
        return _error("El descuento debe ser numérico.")
    if not 0 <= pct <= 100:
        return _error("El descuento debe estar entre 0 y 100 %.")
    descuento = round(subtotal * pct / 100)
    total = subtotal - descuento

    try:
        vigencia = date.fromisoformat(str(d.get("valida")))
    except ValueError:
        vigencia = date.today() + timedelta(days=15)

    estado_front = "Generada" if d.get("estado") == "Generada" else "Borrador"
    estado_bd = "Lista" if estado_front == "Generada" else "Registrada"
    datos = json.dumps({"lineas": limpias, "pct": pct, "estado": estado_front}, ensure_ascii=False)
    condiciones = (d.get("condiciones") or "").strip()

    existente = query_one("SELECT idCotizacion FROM COTIZACION WHERE idSolicitud = %s ORDER BY idCotizacion DESC", (id_solicitud,))
    if existente:
        id_cot = existente["idCotizacion"]
        execute_query("""UPDATE COTIZACION SET subtotal=%s, descuento=%s, total=%s, fechaVigencia=%s,
                         condiciones=%s, estado=%s, datos=%s WHERE idCotizacion=%s""",
                      (subtotal, descuento, total, vigencia.isoformat(), condiciones, estado_bd, datos, id_cot))
    else:
        id_cot = execute_query("""INSERT INTO COTIZACION (idSolicitud, subtotal, descuento, total, fechaVigencia, condiciones, estado, datos)
                                  VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                               (id_solicitud, subtotal, descuento, total, vigencia.isoformat(), condiciones, estado_bd, datos))["last_id"]

    fila = query_one(BASE + " WHERE c.idCotizacion = %s", (id_cot,))
    return jsonify({"success": True, "message": "Cotización guardada.", "data": _salida(fila)}), 200
