import os
import sqlite3
import pymysql
import pymysql.cursors
from config import Config
from werkzeug.security import generate_password_hash

_cached_engine = None


def get_connection():
    """
    Retorna una conexión activa. Con DB_ENGINE=mysql (Railway) conecta a MySQL y, si falla,
    lanza el error (no cambia a SQLite en silencio). SQLite solo si DB_ENGINE=sqlite
    o si se activa DB_FALLBACK_SQLITE=1 para desarrollo.
    """
    global _cached_engine

    if Config.DB_ENGINE == "mysql" and _cached_engine != "sqlite":
        try:
            conn = pymysql.connect(
                host=Config.DB_HOST, port=Config.DB_PORT, user=Config.DB_USER,
                password=Config.DB_PASSWORD, database=Config.DB_NAME,
                cursorclass=pymysql.cursors.DictCursor, autocommit=False,
                charset="utf8mb4", connect_timeout=15
            )
            _cached_engine = "mysql"
            return conn, "mysql"
        except Exception as e:
            if not Config.DB_FALLBACK_SQLITE:
                raise RuntimeError(
                    f"No se pudo conectar a MySQL en {Config.DB_HOST}:{Config.DB_PORT} "
                    f"(base '{Config.DB_NAME}'): {e}"
                ) from e
            print(f"[BD WARNING] MySQL no disponible ({e}). Usando SQLite por DB_FALLBACK_SQLITE=1.")
            _cached_engine = "sqlite"

    conn = sqlite3.connect(Config.SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn, "sqlite"


def execute_query(sql, params=None, commit=True):
    """
    Ejecuta un INSERT, UPDATE o DELETE y retorna el ID generado o filas afectadas.
    """
    conn, engine = get_connection()
    try:
        cursor = conn.cursor()
        if engine == "sqlite":
            # Adaptar sintaxis básica si es necesario
            sql_adapted = sql.replace("%s", "?")
            cursor.execute(sql_adapted, params or ())
            last_id = cursor.lastrowid
            row_count = cursor.rowcount
        else:
            cursor.execute(sql, params or ())
            last_id = cursor.lastrowid
            row_count = cursor.rowcount
            
        if commit:
            conn.commit()
            
        return {"last_id": last_id, "row_count": row_count}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def query_one(sql, params=None):
    """
    Ejecuta un SELECT y retorna una única fila como diccionario (o None).
    """
    conn, engine = get_connection()
    try:
        cursor = conn.cursor()
        if engine == "sqlite":
            sql_adapted = sql.replace("%s", "?")
            cursor.execute(sql_adapted, params or ())
            row = cursor.fetchone()
            return dict(row) if row else None
        else:
            cursor.execute(sql, params or ())
            return cursor.fetchone()
    finally:
        conn.close()

def query_all(sql, params=None):
    """
    Ejecuta un SELECT y retorna una lista de filas (diccionarios).
    """
    conn, engine = get_connection()
    try:
        cursor = conn.cursor()
        if engine == "sqlite":
            sql_adapted = sql.replace("%s", "?")
            cursor.execute(sql_adapted, params or ())
            rows = cursor.fetchall()
            return [dict(r) for r in rows]
        else:
            cursor.execute(sql, params or ())
            return cursor.fetchall()
    finally:
        conn.close()

def init_db():
    """
    Crea las tablas iniciales e inserta datos semilla (roles, admin y paquetes del DERS).
    """
    conn, engine = get_connection()
    try:
        cursor = conn.cursor()
        if engine == "sqlite":
            # Esquema SQLite
            cursor.executescript("""
                CREATE TABLE IF NOT EXISTS ROL (
                    idRol INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL UNIQUE,
                    descripcion TEXT
                );

                CREATE TABLE IF NOT EXISTS USUARIO (
                    idUsuario INTEGER PRIMARY KEY AUTOINCREMENT,
                    idRol INTEGER NOT NULL,
                    nombre TEXT NOT NULL,
                    correo TEXT NOT NULL UNIQUE,
                    contrasenaHash TEXT NOT NULL,
                    estado TEXT DEFAULT 'Activo',
                    creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (idRol) REFERENCES ROL(idRol)
                );

                CREATE TABLE IF NOT EXISTS CLIENTE (
                    idUsuario INTEGER PRIMARY KEY,
                    tipoDocumento TEXT NOT NULL,
                    numeroDocumento TEXT NOT NULL UNIQUE,
                    telefono TEXT,
                    direccion TEXT,
                    fechaRegistro DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (idUsuario) REFERENCES USUARIO(idUsuario) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS PAQUETE_TURISTICO (
                    idPaquete INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL,
                    destino TEXT NOT NULL,
                    tipoViaje TEXT NOT NULL,
                    duracion TEXT NOT NULL,
                    duracionDias INTEGER NOT NULL DEFAULT 1,
                    precio REAL NOT NULL,
                    descripcion TEXT,
                    itinerario TEXT,
                    imagen TEXT,
                    disponibilidad INTEGER NOT NULL DEFAULT 10,
                    condiciones TEXT,
                    estado TEXT DEFAULT 'Activo',
                    creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
                    actualizadoEn DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS SOLICITUD_COTIZACION (
                    idSolicitud INTEGER PRIMARY KEY AUTOINCREMENT,
                    idUsuario INTEGER NOT NULL,
                    idPaquete INTEGER NULL,
                    origen TEXT,
                    destino TEXT NOT NULL,
                    fechaSalida TEXT,
                    fechaRegreso TEXT,
                    numeroViajeros INTEGER NOT NULL DEFAULT 1,
                    presupuestoEstimado REAL,
                    preferencias TEXT,
                    estado TEXT DEFAULT 'Nueva',
                    creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (idUsuario) REFERENCES USUARIO(idUsuario),
                    FOREIGN KEY (idPaquete) REFERENCES PAQUETE_TURISTICO(idPaquete)
                );

                CREATE TABLE IF NOT EXISTS COTIZACION (
                    idCotizacion INTEGER PRIMARY KEY AUTOINCREMENT,
                    idSolicitud INTEGER NOT NULL,
                    subtotal REAL NOT NULL,
                    descuento REAL DEFAULT 0,
                    total REAL NOT NULL,
                    fechaVigencia TEXT NOT NULL,
                    condiciones TEXT,
                    estado TEXT DEFAULT 'Registrada',
                    creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (idSolicitud) REFERENCES SOLICITUD_COTIZACION(idSolicitud)
                );
            """)
            conn.commit()
        else:
            # Para MySQL se puede ejecutar el script schema.sql
            with open("schema.sql", "r", encoding="utf-8") as f:
                sql_script = f.read()
            for statement in sql_script.split(";"):
                stmt = statement.strip()
                if not stmt:
                    continue
                # Se omiten CREATE DATABASE / USE: se usa la base configurada (p. ej. "railway")
                cuerpo = "\n".join(l for l in stmt.splitlines() if not l.strip().startswith("--")).strip()
                if not cuerpo or cuerpo.upper().startswith(("CREATE DATABASE", "USE ")):
                    continue
                cursor.execute(cuerpo)
            conn.commit()

        _migrar(engine)

        # Seed data para Roles
        roles = [
            (1, 'Administrador', 'Control total administrativo y de paquetes'),
            (2, 'Cliente', 'Usuario registrado para cotizar y comparar')
        ]
        for r_id, r_name, r_desc in roles:
            existing_role = query_one("SELECT idRol FROM ROL WHERE idRol = %s OR nombre = %s", (r_id, r_name))
            if not existing_role:
                execute_query("INSERT INTO ROL (idRol, nombre, descripcion) VALUES (%s, %s, %s)", (r_id, r_name, r_desc))

        # Seed de Administrador por defecto según DERS (si no existe)
        admin_email = "admin@rumbo.com"
        existing_admin = query_one("SELECT idUsuario FROM USUARIO WHERE correo = %s", (admin_email,))
        if not existing_admin:
            admin_pass_hash = generate_password_hash("Admin123*")
            execute_query(
                "INSERT INTO USUARIO (idRol, nombre, correo, contrasenaHash, estado) VALUES (%s, %s, %s, %s, %s)",
                (1, "Administrador Rumbo", admin_email, admin_pass_hash, "Activo")
            )
            print(f"[BD INFO] Usuario administrador creado por defecto: {admin_email} / Admin123*")

        # Seed de paquetes turísticos iniciales del DERS (página 74 y 86)
        paquetes_seed = [
            {
                "nombre": "Cartagena esencial",
                "destino": "Cartagena, Colombia",
                "tipoViaje": "Cultura y ciudad",
                "duracion": "4 días / 3 noches",
                "duracionDias": 4,
                "precio": 1850000.0,
                "descripcion": "Descubre la ciudad amurallada y las Islas del Rosario, con alojamiento y experiencias guiadas.",
                "itinerario": "Día 1: Llegada y check-in hotel boutique. Día 2: Tour histórico ciudad amurallada. Día 3: Pasadía Islas del Rosario. Día 4: Mañana libre y retorno.",
                "imagen": "https://images.unsplash.com/photo-1583997052103-b4a1cb974ce3?auto=format&fit=crop&w=800&q=80",
                "disponibilidad": 8,
                "condiciones": "Tarifa base por persona en acomodación doble. Incluye desayunos e impuestos."
            },
            {
                "nombre": "San Andrés, mar adentro",
                "destino": "San Andrés, Colombia",
                "tipoViaje": "Sol y playa",
                "duracion": "5 días / 4 noches",
                "duracionDias": 5,
                "precio": 2490000.0,
                "descripcion": "El mar de los siete colores te espera con paseos a Johnny Cay, acuario natural y confort playero.",
                "itinerario": "Día 1: Arribo y traslado a hotel frente al mar. Día 2: Vuelta a la isla en chiva típica. Día 3: Tour a Johnny Cay y Acuario. Día 4: Día de relax y compras. Día 5: Regreso.",
                "imagen": "https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?auto=format&fit=crop&w=800&q=80",
                "disponibilidad": 6,
                "condiciones": "No incluye tarjeta de turismo de entrada a la isla. Incluye traslados y hotel 4 estrellas."
            },
            {
                "nombre": "Bogotá entre montañas",
                "destino": "Bogotá, Colombia",
                "tipoViaje": "Cultura y ciudad",
                "duracion": "3 días / 2 noches",
                "duracionDias": 3,
                "precio": 890000.0,
                "descripcion": "Recorre La Candelaria, sube a Monserrate y disfruta de la mejor oferta cultural y gastronómica del país.",
                "itinerario": "Día 1: Llegada al hotel urbano en zona financiera. Día 2: Subida en teleférico a Monserrate y visita al Museo del Oro. Día 3: Recorrido gastronómico y salida.",
                "imagen": "https://images.unsplash.com/photo-1544986581-efac024faf62?auto=format&fit=crop&w=800&q=80",
                "disponibilidad": 12,
                "condiciones": "Tarifa por persona. Desayunos tipo buffet incluidos."
            },
            {
                "nombre": "Antioquia a todo color",
                "destino": "Medellín, Colombia",
                "tipoViaje": "Naturaleza y aventura",
                "duracion": "4 días / 3 noches",
                "duracionDias": 4,
                "precio": 1290000.0,
                "descripcion": "Primavera eterna en Medellín, ascenso a la Piedra del Peñol y navegación por el embalse de Guatapé.",
                "itinerario": "Día 1: Recorrido Comuna 13 y Metrocable. Día 2: Excursión de día entero a Guatapé y Peñol. Día 3: Jardín Botánico y Parque Explora. Día 4: Check-out.",
                "imagen": "https://images.unsplash.com/photo-1582650625119-3a31f8418b7d?auto=format&fit=crop&w=800&q=80",
                "disponibilidad": 10,
                "condiciones": "Incluye transporte privado en excursiones y guía bilingüe opcional."
            },
            {
                "nombre": "Perú, legado andino",
                "destino": "Cusco, Perú",
                "tipoViaje": "Naturaleza y aventura",
                "duracion": "6 días / 5 noches",
                "duracionDias": 6,
                "precio": 3290000.0,
                "descripcion": "Una experiencia inolvidable por el Valle Sagrado, la ciudad imperial del Cusco y la ciudadela de Machu Picchu.",
                "itinerario": "Día 1: Llegada a Cusco y aclimatación. Día 2: Valle Sagrado de los Incas. Día 3: Tren panorámico y Machu Picchu. Día 4: Montaña de 7 colores. Día 5: Día libre en Cusco. Día 6: Vuelo de salida.",
                "imagen": "https://images.unsplash.com/photo-1526392060635-9d6019884377?auto=format&fit=crop&w=800&q=80",
                "disponibilidad": 4,
                "condiciones": "Requiere pasaporte vigente. Entradas a Machu Picchu y tren Expedition incluidos."
            },
            {
                "nombre": "México con los sentidos",
                "destino": "Ciudad de México, México",
                "tipoViaje": "Cultura y ciudad",
                "duracion": "5 días / 4 noches",
                "duracionDias": 5,
                "precio": 3150000.0,
                "descripcion": "Historia viva en el Zócalo, pirámides de Teotihuacán y canales de Xochimilco con mariachis en vivo.",
                "itinerario": "Día 1: Llegada a CDMX. Día 2: Centro histórico y Bellas Artes. Día 3: Pirámides de Teotihuacán. Día 4: Coyoacán y Museo Frida Kahlo + Xochimilco. Día 5: Salida.",
                "imagen": "https://images.unsplash.com/photo-1518105779142-d975f22f1b0a?auto=format&fit=crop&w=800&q=80",
                "disponibilidad": 8,
                "condiciones": "Incluye todos los traslados y accesos a zonas arqueológicas."
            }
        ]

        from datetime import date, timedelta
        for i, p in enumerate(paquetes_seed):
            p["fechaSalida"] = (date.today() + timedelta(days=45 + i * 12)).isoformat()
            p["servicios"] = '["Hotel 4 estrellas", "Desayuno", "Traslados"]'
            existing_p = query_one("SELECT idPaquete FROM PAQUETE_TURISTICO WHERE nombre = %s", (p["nombre"],))
            if not existing_p:
                execute_query("""
                    INSERT INTO PAQUETE_TURISTICO 
                    (nombre, destino, tipoViaje, duracion, duracionDias, precio, descripcion, itinerario, imagen, disponibilidad, condiciones, estado, fechaSalida, servicios)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Activo', %s, %s)
                """, (
                    p["nombre"], p["destino"], p["tipoViaje"], p["duracion"], p["duracionDias"],
                    p["precio"], p["descripcion"], p["itinerario"], p["imagen"], p["disponibilidad"], p["condiciones"],
                    p["fechaSalida"], p["servicios"]
                ))
        print(f"[BD INFO] Base de datos ({engine}) inicializada con roles, admin y paquetes.")

    except Exception as e:
        print(f"[BD ERROR] Error inicializando base de datos: {e}")
        raise e
    finally:
        conn.close()


def _migrar(engine):
    """Agrega las columnas que usa el frontend y normaliza datos. Es seguro correrlo varias veces."""
    cambios = [
        "ALTER TABLE PAQUETE_TURISTICO ADD COLUMN fechaSalida DATE NULL",
        "ALTER TABLE PAQUETE_TURISTICO ADD COLUMN servicios TEXT NULL",
        "ALTER TABLE SOLICITUD_COTIZACION ADD COLUMN viajeros VARCHAR(120) NULL",
        "ALTER TABLE SOLICITUD_COTIZACION ADD COLUMN acomodacion VARCHAR(80) NULL",
        "ALTER TABLE SOLICITUD_COTIZACION ADD COLUMN prioridad VARCHAR(10) NULL",
        "ALTER TABLE COTIZACION ADD COLUMN datos TEXT NULL",
    ]
    if engine == "mysql":
        cambios.append("ALTER TABLE PAQUETE_TURISTICO MODIFY imagen MEDIUMTEXT NULL")  # admite imagen subida
    for sql in cambios:
        try:
            execute_query(sql)
        except Exception:
            pass  # la columna ya existe

    normalizar = [
        "UPDATE PAQUETE_TURISTICO SET tipoViaje='Cultura y ciudad' WHERE tipoViaje IN ('Cultura y playa','Escapada urbana','Cultura y gastronomia')",
        "UPDATE PAQUETE_TURISTICO SET tipoViaje='Naturaleza y aventura' WHERE tipoViaje IN ('Naturaleza','Aventura')",
        "UPDATE PAQUETE_TURISTICO SET destino='Medellín, Colombia' WHERE destino='Medellín y Guatapé, Colombia'",
        "UPDATE PAQUETE_TURISTICO SET destino='Cusco, Perú' WHERE destino='Cusco y Machu Picchu, Perú'",
        "UPDATE PAQUETE_TURISTICO SET servicios='[]' WHERE servicios IS NULL",
    ]
    for sql in normalizar:
        try:
            execute_query(sql)
        except Exception:
            pass
    from datetime import date, timedelta
    filas = query_all("SELECT idPaquete FROM PAQUETE_TURISTICO WHERE fechaSalida IS NULL ORDER BY idPaquete")
    for i, f in enumerate(filas):
        execute_query("UPDATE PAQUETE_TURISTICO SET fechaSalida = %s WHERE idPaquete = %s",
                      ((date.today() + timedelta(days=45 + i * 12)).isoformat(), f["idPaquete"]))
