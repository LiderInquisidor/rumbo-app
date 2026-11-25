import os
from app import create_app
from database import init_db

app = create_app()

# Crea tablas, columnas y datos iniciales (también cuando arranca gunicorn en Railway)
try:
    init_db()
except Exception as e:
    print(f"[ALERTA INICIO] Error al inicializar la base de datos: {e}")

if __name__ == "__main__":
    puerto = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=puerto, debug=os.getenv("FLASK_DEBUG", "0") == "1")
