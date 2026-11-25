import json
from flask import Blueprint, request, jsonify, g
from database import query_one, query_all, execute_query
from app.utils.security import admin_required, decode_jwt_token
from app.utils.serial import limpiar


def _es_admin():
    """True si la petición trae un token válido de Administrador (el token es opcional en rutas públicas)."""
    partes = request.headers.get("Authorization", "").split()
    if len(partes) == 2 and partes[0].lower() == "bearer":
        d = decode_jwt_token(partes[1])
        return bool(d and d.get("rol") == "Administrador")
    return False


def _servicios_json(valor):
    if isinstance(valor, list):
        return json.dumps([str(x) for x in valor], ensure_ascii=False)
    return valor if isinstance(valor, str) else "[]"

paquetes_bp = Blueprint("paquetes", __name__, url_prefix="/api/paquetes")

@paquetes_bp.route("", methods=["GET"])
def list_paquetes():
    """
    Soporte RF11: Buscar y filtrar paquetes turísticos.
    Permite filtrar por destino, tipo de viaje, precio máximo, duración y texto de búsqueda.
    """
    q = request.args.get("q", "").strip()
    destino = request.args.get("destino", "").strip()
    tipo_viaje = request.args.get("tipoViaje", "").strip()
    precio_max = request.args.get("precioMax", type=float)
    duracion = request.args.get("duracion", "").strip()
    # Solo el administrador puede ver paquetes inactivos; el público ve únicamente los activos
    estado = request.args.get("estado", "Activo").strip() if _es_admin() else "Activo"

    sql = "SELECT * FROM PAQUETE_TURISTICO WHERE 1=1"
    params = []

    if estado:
        sql += " AND estado = %s"
        params.append(estado)

    if q:
        sql += " AND (nombre LIKE %s OR destino LIKE %s OR descripcion LIKE %s)"
        search_term = f"%{q}%"
        params.extend([search_term, search_term, search_term])

    if destino and destino != "Todos los destinos":
        sql += " AND destino LIKE %s"
        params.append(f"%{destino}%")

    if tipo_viaje and tipo_viaje != "Todos los viajes":
        sql += " AND tipoViaje LIKE %s"
        params.append(f"%{tipo_viaje}%")

    if precio_max is not None and precio_max > 0:
        sql += " AND precio <= %s"
        params.append(precio_max)

    if duracion and duracion != "Todas":
        if duracion.isdigit():
            sql += " AND duracionDias = %s"
            params.append(int(duracion))
        else:
            sql += " AND duracion LIKE %s"
            params.append(f"%{duracion}%")

    sql += " ORDER BY idPaquete ASC"

    paquetes = query_all(sql, params)
    return jsonify({
        "success": True,
        "total": len(paquetes),
        "data": [limpiar(p) for p in paquetes]
    }), 200

@paquetes_bp.route("/<int:id_paquete>", methods=["GET"])
def get_paquete(id_paquete):
    """
    Soporte RF10 y RNF05: Detalle de paquete turístico y comparador.
    """
    paquete = query_one("SELECT * FROM PAQUETE_TURISTICO WHERE idPaquete = %s", (id_paquete,))
    if not paquete:
        return jsonify({
            "success": False,
            "error": "Paquete turístico no encontrado."
        }), 404

    if paquete["estado"] != "Activo" and not _es_admin():
        return jsonify({"success": False, "error": "Paquete turístico no encontrado."}), 404

    return jsonify({
        "success": True,
        "data": limpiar(paquete)
    }), 200

@paquetes_bp.route("", methods=["POST"])
@admin_required
def create_paquete():
    """
    RF12: Registrar paquetes turísticos (Exclusivo Administrador).
    """
    data = request.get_json() or {}

    nombre = data.get("nombre", "").strip()
    destino = data.get("destino", "").strip()
    tipo_viaje = data.get("tipoViaje", "").strip()
    duracion = data.get("duracion", "").strip()
    duracion_dias = data.get("duracionDias", 1)
    precio = data.get("precio")
    descripcion = data.get("descripcion", "").strip()
    itinerario = data.get("itinerario", "").strip()
    imagen = data.get("imagen", "").strip()
    disponibilidad = data.get("disponibilidad", 10)
    condiciones = data.get("condiciones", "").strip()
    fecha_salida = (data.get("fechaSalida") or "").strip() or None
    servicios = _servicios_json(data.get("servicios", []))

    # Validaciones obligatorias
    if not nombre or not destino or not tipo_viaje or not duracion or precio is None:
        return jsonify({
            "success": False,
            "error": "Los campos nombre, destino, tipoViaje, duracion y precio son obligatorios."
        }), 400

    try:
        precio_val = float(precio)
        if precio_val <= 0:
            return jsonify({
                "success": False,
                "error": "El precio debe ser un número positivo mayor que 0."
            }), 400
    except (ValueError, TypeError):
        return jsonify({
            "success": False,
            "error": "El precio debe ser un número válido."
        }), 400

    res = execute_query("""
        INSERT INTO PAQUETE_TURISTICO 
        (nombre, destino, tipoViaje, duracion, duracionDias, precio, descripcion, itinerario, imagen, disponibilidad, condiciones, estado, fechaSalida, servicios)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Activo', %s, %s)
    """, (
        nombre, destino, tipo_viaje, duracion, int(duracion_dias or 1),
        precio_val, descripcion, itinerario, imagen, int(disponibilidad or 10), condiciones,
        fecha_salida, servicios
    ))

    nuevo_paquete = query_one("SELECT * FROM PAQUETE_TURISTICO WHERE idPaquete = %s", (res["last_id"],))

    return jsonify({
        "success": True,
        "message": "Paquete turístico registrado con éxito.",
        "data": limpiar(nuevo_paquete)
    }), 201

@paquetes_bp.route("/<int:id_paquete>", methods=["PUT"])
@admin_required
def update_paquete(id_paquete):
    """
    RF13: Modificar paquetes turísticos (Exclusivo Administrador).
    """
    paquete_existente = query_one("SELECT idPaquete FROM PAQUETE_TURISTICO WHERE idPaquete = %s", (id_paquete,))
    if not paquete_existente:
        return jsonify({
            "success": False,
            "error": "El paquete turístico no existe."
        }), 404

    data = request.get_json() or {}

    # Campos actualizables
    updatable_fields = [
        "nombre", "destino", "tipoViaje", "duracion", "duracionDias",
        "precio", "descripcion", "itinerario", "imagen", "disponibilidad",
        "condiciones", "estado", "fechaSalida", "servicios"
    ]

    set_clauses = []
    params = []

    for field in updatable_fields:
        if field in data:
            val = data[field]
            if field == "precio":
                try:
                    val = float(val)
                    if val <= 0:
                        return jsonify({"success": False, "error": "El precio debe ser mayor que 0."}), 400
                except (ValueError, TypeError):
                    return jsonify({"success": False, "error": "El precio debe ser numérico."}), 400
            elif field in ("duracionDias", "disponibilidad"):
                val = int(val)
            elif field == "servicios":
                val = _servicios_json(val)
            elif field == "fechaSalida":
                val = (val or "").strip() or None
            elif isinstance(val, str):
                val = val.strip()

            set_clauses.append(f"{field} = %s")
            params.append(val)

    if not set_clauses:
        return jsonify({
            "success": False,
            "error": "No se enviaron datos para actualizar."
        }), 400

    params.append(id_paquete)
    sql = f"UPDATE PAQUETE_TURISTICO SET {', '.join(set_clauses)} WHERE idPaquete = %s"
    execute_query(sql, params)

    paquete_actualizado = query_one("SELECT * FROM PAQUETE_TURISTICO WHERE idPaquete = %s", (id_paquete,))

    return jsonify({
        "success": True,
        "message": "Paquete turístico actualizado con éxito.",
        "data": limpiar(paquete_actualizado)
    }), 200

