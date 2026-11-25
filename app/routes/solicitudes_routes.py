import re
from datetime import date
from flask import Blueprint, request, jsonify, g
from database import query_one, query_all, execute_query
from app.utils.security import token_required, admin_required
from app.utils.serial import limpiar

solicitudes_bp = Blueprint("solicitudes", __name__, url_prefix="/api/solicitudes")

ESTADOS = ("Nueva", "En gestión", "Cotizada")

SELECT_BASE = """
    SELECT s.idSolicitud, s.idPaquete, s.origen, s.destino, s.fechaSalida, s.fechaRegreso,
           s.numeroViajeros, s.viajeros, s.acomodacion, s.prioridad, s.presupuestoEstimado,
           s.preferencias, s.estado, s.creadoEn, u.nombre AS cliente, u.correo AS correo
    FROM SOLICITUD_COTIZACION s
    JOIN USUARIO u ON s.idUsuario = u.idUsuario
"""


def _salida(fila):
    """Fila de BD -> forma que usa el frontend."""
    r = limpiar(fila)
    creada = str(r.get("creadoEn") or "")[:10]
    anio = creada[:4] or str(date.today().year)
    return {
        "id": f"RUM-{anio}-{int(r['idSolicitud']):04d}",
        "idSolicitud": r["idSolicitud"],
        "cliente": r["cliente"], "correo": r["correo"],
        "origen": r.get("origen") or "", "destino": r["destino"],
        "desde": str(r.get("fechaSalida") or "")[:10], "hasta": str(r.get("fechaRegreso") or "")[:10],
        "viajeros": r.get("viajeros") or f"{r['numeroViajeros']} viajero(s)",
        "numeroViajeros": r["numeroViajeros"], "acomodacion": r.get("acomodacion") or "",
        "presupuesto": r.get("presupuestoEstimado") or 0, "preferencias": r.get("preferencias") or "",
        "estado": r["estado"], "prioridad": r.get("prioridad") or "Baja",
        "canal": "Web", "recibida": creada, "falta": "", "paquete": r.get("idPaquete") or "",
    }


def _fecha(texto):
    try:
        return date.fromisoformat(str(texto))
    except ValueError:
        return None


def _error(msg, codigo=400):
    return jsonify({"success": False, "error": msg}), codigo


@solicitudes_bp.route("", methods=["POST"])
@token_required
def crear_solicitud():
    """RF04: el cliente envía una solicitud de cotización."""
    d = request.get_json() or {}
    destino = (d.get("destino") or "").strip()
    salida, regreso = _fecha(d.get("fechaSalida")), _fecha(d.get("fechaRegreso"))
    try:
        viajeros_n = int(d.get("numeroViajeros", 0))
        presupuesto = float(d.get("presupuesto", 0))
    except (TypeError, ValueError):
        return _error("Número de viajeros y presupuesto deben ser numéricos.")

    if not destino:
        return _error("El destino es obligatorio.")
    if not salida or not regreso:
        return _error("Las fechas de salida y regreso son obligatorias (AAAA-MM-DD).")
    if regreso < salida:
        return _error("La fecha de regreso no puede ser anterior a la de salida.")
    if viajeros_n < 1:
        return _error("Debe haber al menos 1 viajero.")
    if presupuesto <= 0:
        return _error("El presupuesto debe ser mayor que 0.")

    id_paquete = None
    m = re.search(r"(\d+)$", str(d.get("paquete") or ""))
    if m and query_one("SELECT idPaquete FROM PAQUETE_TURISTICO WHERE idPaquete = %s", (int(m.group(1)),)):
        id_paquete = int(m.group(1))

    dias = (salida - date.today()).days
    prioridad = "Alta" if dias <= 30 else "Media" if dias <= 60 else "Baja"

    res = execute_query("""
        INSERT INTO SOLICITUD_COTIZACION
        (idUsuario, idPaquete, origen, destino, fechaSalida, fechaRegreso, numeroViajeros, viajeros,
         acomodacion, prioridad, presupuestoEstimado, preferencias, estado)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Nueva')
    """, (g.current_user["idUsuario"], id_paquete, (d.get("origen") or "").strip(), destino,
          salida.isoformat(), regreso.isoformat(), viajeros_n, (d.get("viajeros") or "").strip(),
          (d.get("acomodacion") or "").strip(), prioridad, presupuesto, (d.get("preferencias") or "").strip()))

    fila = query_one(SELECT_BASE + " WHERE s.idSolicitud = %s", (res["last_id"],))
    return jsonify({"success": True, "message": "Solicitud enviada.", "data": _salida(fila)}), 201


@solicitudes_bp.route("", methods=["GET"])
@admin_required
def listar_solicitudes():
    """RF05: el administrador consulta las solicitudes."""
    sql, params = SELECT_BASE + " WHERE 1=1", []
    estado = request.args.get("estado", "").strip()
    if estado:
        sql += " AND s.estado = %s"
        params.append(estado)
    sql += " ORDER BY s.idSolicitud DESC"
    filas = query_all(sql, params)
    return jsonify({"success": True, "total": len(filas), "data": [_salida(f) for f in filas]}), 200


@solicitudes_bp.route("/<int:id_solicitud>", methods=["GET"])
@admin_required
def obtener_solicitud(id_solicitud):
    fila = query_one(SELECT_BASE + " WHERE s.idSolicitud = %s", (id_solicitud,))
    if not fila:
        return _error("Solicitud no encontrada.", 404)
    return jsonify({"success": True, "data": _salida(fila)}), 200


@solicitudes_bp.route("/<int:id_solicitud>", methods=["PUT"])
@admin_required
def actualizar_solicitud(id_solicitud):
    """RF05: el administrador cambia el estado (Nueva, En gestión, Cotizada)."""
    if not query_one("SELECT idSolicitud FROM SOLICITUD_COTIZACION WHERE idSolicitud = %s", (id_solicitud,)):
        return _error("Solicitud no encontrada.", 404)
    estado = ((request.get_json() or {}).get("estado") or "").strip()
    if estado not in ESTADOS:
        return _error("Estado inválido. Use: " + ", ".join(ESTADOS) + ".")
    execute_query("UPDATE SOLICITUD_COTIZACION SET estado = %s WHERE idSolicitud = %s", (estado, id_solicitud))
    fila = query_one(SELECT_BASE + " WHERE s.idSolicitud = %s", (id_solicitud,))
    return jsonify({"success": True, "message": "Estado actualizado.", "data": _salida(fila)}), 200
