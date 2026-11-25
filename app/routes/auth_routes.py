import re
from flask import Blueprint, request, jsonify, g
from database import query_one, execute_query
from app.utils.security import (
    hash_password,
    verify_password,
    generate_jwt_token,
    token_required
)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

def is_valid_email(email: str) -> bool:
    regex = r"^[\w\.-]+@[\w\.-]+\.\w+$"
    return bool(re.match(regex, email))

@auth_bp.route("/register", methods=["POST"])
def register():
    """
    RF01: Registrar información de clientes
    Permite el registro de nuevos clientes y crea la cuenta directamente en estado 'Activo' (según Acta MVP).
    """
    data = request.get_json() or {}
    
    nombre = data.get("nombre", "").strip()
    correo = data.get("correo", "").strip().lower()
    password = data.get("password", "")
    tipo_doc = data.get("tipoDocumento", "CC").strip()
    numero_doc = data.get("numeroDocumento", "").strip()
    telefono = data.get("telefono", "").strip()
    direccion = data.get("direccion", "").strip()

    # Validaciones obligatorias
    if not nombre or not correo or not password or not numero_doc:
        return jsonify({
            "success": False,
            "error": "Los campos nombre, correo, contraseña y número de documento son obligatorios."
        }), 400

    if not is_valid_email(correo):
        return jsonify({
            "success": False,
            "error": "El formato del correo electrónico no es válido."
        }), 400

    if len(password) < 8 or not re.search(r"[A-Z]", password) or not re.search(r"\d", password):
        return jsonify({
            "success": False,
            "error": "La contraseña debe tener al menos 8 caracteres, una mayúscula y un número."
        }), 400

    if telefono and not 7 <= len(re.sub(r"\D", "", telefono)) <= 15:
        return jsonify({"success": False, "error": "El teléfono debe tener entre 7 y 15 dígitos."}), 400

    # Control de duplicados (correo)
    existing_email = query_one("SELECT idUsuario FROM USUARIO WHERE correo = %s", (correo,))
    if existing_email:
        return jsonify({
            "success": False,
            "error": "El correo electrónico ya se encuentra registrado."
        }), 409

    # Control de duplicados (documento)
    existing_doc = query_one("SELECT idUsuario FROM CLIENTE WHERE numeroDocumento = %s", (numero_doc,))
    if existing_doc:
        return jsonify({
            "success": False,
            "error": "El número de documento ya se encuentra registrado."
        }), 409

    # Rol Cliente = 2
    rol_cliente = query_one("SELECT idRol FROM ROL WHERE nombre = 'Cliente'")
    id_rol = rol_cliente["idRol"] if rol_cliente else 2

    # Inserción en USUARIO
    pw_hash = hash_password(password)
    res_user = execute_query("""
        INSERT INTO USUARIO (idRol, nombre, correo, contrasenaHash, estado)
        VALUES (%s, %s, %s, %s, 'Activo')
    """, (id_rol, nombre, correo, pw_hash))
    user_id = res_user["last_id"]

    # Inserción en CLIENTE
    execute_query("""
        INSERT INTO CLIENTE (idUsuario, tipoDocumento, numeroDocumento, telefono, direccion)
        VALUES (%s, %s, %s, %s, %s)
    """, (user_id, tipo_doc, numero_doc, telefono, direccion))

    # Token para iniciar sesión de inmediato
    token = generate_jwt_token(user_id, "Cliente", correo)

    return jsonify({
        "success": True,
        "message": "Registro completado con éxito.",
        "token": token,
        "usuario": {
            "id": user_id,
            "nombre": nombre,
            "correo": correo,
            "rol": "Cliente",
            "tipoDocumento": tipo_doc,
            "numeroDocumento": numero_doc,
            "telefono": telefono,
            "direccion": direccion
        }
    }), 201

@auth_bp.route("/login", methods=["POST"])
def login():
    """
    RNF01: Inicio de sesión con autenticación y verificación de roles.
    """
    data = request.get_json() or {}
    correo = data.get("correo", "").strip().lower()
    password = data.get("password", "")

    if not correo or not password:
        return jsonify({
            "success": False,
            "error": "Debe ingresar correo y contraseña."
        }), 400

    user = query_one("""
        SELECT u.idUsuario, u.idRol, u.nombre, u.correo, u.contrasenaHash, u.estado, r.nombre AS rol
        FROM USUARIO u
        JOIN ROL r ON u.idRol = r.idRol
        WHERE u.correo = %s
    """, (correo,))

    if not user or not verify_password(password, user["contrasenaHash"]):
        return jsonify({
            "success": False,
            "error": "Credenciales inválidas. Verifique su correo y contraseña."
        }), 401

    if user["estado"] != "Activo":
        return jsonify({
            "success": False,
            "error": "La cuenta se encuentra inactiva. Contacte al administrador."
        }), 403

    token = generate_jwt_token(user["idUsuario"], user["rol"], user["correo"])

    # Datos adicionales si es cliente
    cliente_info = query_one("""
        SELECT tipoDocumento, numeroDocumento, telefono, direccion
        FROM CLIENTE WHERE idUsuario = %s
    """, (user["idUsuario"],)) or {}

    return jsonify({
        "success": True,
        "message": "Inicio de sesión exitoso.",
        "token": token,
        "usuario": {
            "id": user["idUsuario"],
            "nombre": user["nombre"],
            "correo": user["correo"],
            "rol": user["rol"],
            **cliente_info
        }
    }), 200

@auth_bp.route("/me", methods=["GET"])
@token_required
def get_current_user():
    """
    Obtiene los datos del usuario en sesión actual.
    """
    user = g.current_user
    cliente_info = query_one("""
        SELECT tipoDocumento, numeroDocumento, telefono, direccion
        FROM CLIENTE WHERE idUsuario = %s
    """, (user["idUsuario"],)) or {}

    return jsonify({
        "success": True,
        "usuario": {
            "id": user["idUsuario"],
            "nombre": user["nombre"],
            "correo": user["correo"],
            "rol": user["rol"],
            **cliente_info
        }
    }), 200

