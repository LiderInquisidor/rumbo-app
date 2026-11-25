import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from config import Config
from app.routes.auth_routes import auth_bp
from app.routes.paquetes_routes import paquetes_bp
from app.routes.solicitudes_routes import solicitudes_bp
from app.routes.cotizaciones_routes import cotizaciones_bp

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(RAIZ, "frontend")


def create_app():
    # El mismo servidor entrega la API (/api/...) y las páginas del frontend (/)
    app = Flask(__name__, static_folder=FRONTEND, static_url_path="")
    app.config.from_object(Config)

    if Config.CORS_ORIGINS:  # solo si el frontend se publica en otro dominio
        CORS(app, resources={r"/api/*": {"origins": Config.CORS_ORIGINS}})

    app.register_blueprint(auth_bp)
    app.register_blueprint(paquetes_bp)
    app.register_blueprint(solicitudes_bp)
    app.register_blueprint(cotizaciones_bp)

    @app.route("/")
    def inicio():
        return send_from_directory(FRONTEND, "index.html")

    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({"status": "online", "app": "Rumbo - Sistema Web de Agencia de Viajes (MVP)", "version": "1.1"}), 200

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"success": False, "error": "Recurso no encontrado"}), 404

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"success": False, "error": "Error interno del servidor"}), 500

    return app
