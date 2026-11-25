import os
from urllib.parse import urlparse, unquote
from dotenv import load_dotenv

# Carga las variables del archivo .env (en Railway se definen en el panel "Variables")
load_dotenv()


def _url_mysql():
    """Railway entrega MYSQL_URL (mysql://usuario:clave@host:puerto/base)."""
    url = os.getenv("MYSQL_URL") or os.getenv("DATABASE_URL") or ""
    if not url.startswith("mysql"):
        return None
    u = urlparse(url)
    return {
        "host": u.hostname, "port": u.port or 3306,
        "user": unquote(u.username or ""), "password": unquote(u.password or ""),
        "name": (u.path or "").lstrip("/"),
    }


def _pick(*valores, default=None):
    for v in valores:
        if v not in (None, ""):
            return v
    return default


_u = _url_mysql() or {}


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "cambia-esta-clave-en-produccion")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "cambia-este-jwt-en-produccion")
    JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", 24))

    # Base de datos. Prioridad: DB_* (manual) > MYSQL_URL > variables MYSQL* de Railway.
    DB_ENGINE = os.getenv("DB_ENGINE", "mysql").lower()
    DB_HOST = _pick(os.getenv("DB_HOST"), _u.get("host"), os.getenv("MYSQLHOST"), default="localhost")
    DB_PORT = int(_pick(os.getenv("DB_PORT"), _u.get("port"), os.getenv("MYSQLPORT"), default=3306))
    DB_USER = _pick(os.getenv("DB_USER"), _u.get("user"), os.getenv("MYSQLUSER"), default="root")
    DB_PASSWORD = _pick(os.getenv("DB_PASSWORD"), _u.get("password"), os.getenv("MYSQLPASSWORD"), default="")
    DB_NAME = _pick(os.getenv("DB_NAME"), _u.get("name"), os.getenv("MYSQLDATABASE"), default="agencia_viajes")
    SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", "agencia_viajes.db")
    # Solo para desarrollo sin MySQL: DB_FALLBACK_SQLITE=1. Por defecto NO se cambia de motor en silencio.
    DB_FALLBACK_SQLITE = os.getenv("DB_FALLBACK_SQLITE", "0") == "1"

    # CORS: el frontend se sirve desde el mismo dominio, así que por defecto no hace falta.
    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
