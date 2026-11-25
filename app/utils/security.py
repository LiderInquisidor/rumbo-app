import jwt
from datetime import datetime, timezone, timedelta
from functools import wraps
from flask import request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash
from config import Config
from database import query_one

def hash_password(password: str) -> str:
    """Genera un hash seguro para la contraseña."""
    return generate_password_hash(password)

def verify_password(password: str, hashed: str) -> bool:
    """Verifica si la contraseña coincide con el hash."""
    return check_password_hash(hashed, password)

def generate_jwt_token(user_id: int, role: str, email: str) -> str:
    """
    Genera un JSON Web Token con vencimiento y datos del rol.
    """
    payload = {
        "sub": str(user_id),
        "email": email,
        "rol": role,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=Config.JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm="HS256")

def decode_jwt_token(token: str):
    """
    Decodifica y valida la vigencia del token.
    """
    try:
        return jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def token_required(f):
    """
    Decorador para requerir sesión activa mediante token JWT.
    Inyecta el usuario autenticado en `g.current_user`.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return jsonify({"success": False, "error": "Token de autenticación requerido"}), 401

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return jsonify({"success": False, "error": "Formato de token inválido. Use 'Bearer <token>'"}), 401

        token = parts[1]
        decoded = decode_jwt_token(token)
        if not decoded:
            return jsonify({"success": False, "error": "Token inválido o expirado"}), 401

        user = query_one("""
            SELECT u.idUsuario, u.nombre, u.correo, u.estado, r.nombre AS rol
            FROM USUARIO u
            JOIN ROL r ON u.idRol = r.idRol
            WHERE u.idUsuario = %s
        """, (int(decoded["sub"]),))

        if not user or user["estado"] != "Activo":
            return jsonify({"success": False, "error": "Usuario inactivo o no encontrado"}), 403

        g.current_user = user
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    """
    Decorador para restringir el acceso exclusivamente al Administrador.
    Devuelve 403 si el rol no es Administrador.
    """
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        if g.current_user.get("rol") != "Administrador":
            return jsonify({
                "success": False,
                "error": "Acceso denegado: se requieren permisos de Administrador (403)"
            }), 403
        return f(*args, **kwargs)
    return decorated
