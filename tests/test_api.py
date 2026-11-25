import unittest
import json
from app import create_app
from database import init_db

class TestRumboAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import os
        from database import execute_query
        init_db()
        # Limpiar datos previos de pruebas si existen
        try:
            execute_query("DELETE FROM CLIENTE WHERE numeroDocumento IN ('999888777', '999888778')")
            execute_query("DELETE FROM USUARIO WHERE correo IN ('viajero.test@correo.com', 'viajero2.test@correo.com')")
            execute_query("DELETE FROM PAQUETE_TURISTICO WHERE nombre = 'Amazonas Místico'")
        except Exception:
            pass
        cls.app = create_app()
        cls.client = cls.app.test_client()

    def test_01_health_check(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "online")

    def test_02_get_paquetes_public(self):
        res = self.client.get("/api/paquetes")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertGreaterEqual(data["total"], 1)

    def test_03_filter_paquetes_destino(self):
        res = self.client.get("/api/paquetes?destino=Cartagena")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        for p in data["data"]:
            self.assertIn("Cartagena", p["destino"])

    def test_04_client_registration_and_login(self):
        # 1. Registro de nuevo cliente
        new_client = {
            "nombre": "Test Viajero",
            "correo": "viajero.test@correo.com",
            "password": "Password123*",
            "tipoDocumento": "CC",
            "numeroDocumento": "999888777",
            "telefono": "+57 300 123 4567",
            "direccion": "Calle 123 #45-67"
        }
        res_reg = self.client.post("/api/auth/register", json=new_client)
        self.assertEqual(res_reg.status_code, 201)
        data_reg = res_reg.get_json()
        self.assertTrue(data_reg["success"])
        self.assertIn("token", data_reg)
        self.assertEqual(data_reg["usuario"]["rol"], "Cliente")

        # 2. Intento de registro duplicado
        res_dup = self.client.post("/api/auth/register", json=new_client)
        self.assertEqual(res_dup.status_code, 409)

        # 3. Login con credenciales válidas
        res_login = self.client.post("/api/auth/login", json={
            "correo": "viajero.test@correo.com",
            "password": "Password123*"
        })
        self.assertEqual(res_login.status_code, 200)
        data_login = res_login.get_json()
        self.assertTrue(data_login["success"])
        self.token_cliente = data_login["token"]

        # 4. Consulta de perfil con token
        res_me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {self.token_cliente}"})
        self.assertEqual(res_me.status_code, 200)
        data_me = res_me.get_json()
        self.assertEqual(data_me["usuario"]["correo"], "viajero.test@correo.com")

    def test_05_admin_paquetes_crud_and_permissions(self):
        # 1. Login como Administrador (credenciales seed del DERS)
        res_admin = self.client.post("/api/auth/login", json={
            "correo": "admin@rumbo.com",
            "password": "Admin123*"
        })
        self.assertEqual(res_admin.status_code, 200)
        token_admin = res_admin.get_json()["token"]

        # 2. Crear nuevo paquete como Admin (RF12)
        nuevo_paquete = {
            "nombre": "Amazonas Místico",
            "destino": "Leticia, Colombia",
            "tipoViaje": "Naturaleza",
            "duracion": "5 días / 4 noches",
            "duracionDias": 5,
            "precio": 2100000.0,
            "descripcion": "Explora la selva amazónica y las comunidades indígenas.",
            "itinerario": "Día 1 a 5 expedición selvática.",
            "disponibilidad": 15,
            "condiciones": "Vacuna contra fiebre amarilla obligatoria."
        }
        res_create = self.client.post(
            "/api/paquetes",
            json=nuevo_paquete,
            headers={"Authorization": f"Bearer {token_admin}"}
        )
        self.assertEqual(res_create.status_code, 201)
        data_create = res_create.get_json()
        self.assertTrue(data_create["success"])
        id_paquete = data_create["data"]["idPaquete"]

        # 3. Modificar paquete como Admin (RF13)
        res_update = self.client.put(
            f"/api/paquetes/{id_paquete}",
            json={"precio": 2250000.0, "disponibilidad": 12},
            headers={"Authorization": f"Bearer {token_admin}"}
        )
        self.assertEqual(res_update.status_code, 200)
        data_update = res_update.get_json()
        self.assertEqual(float(data_update["data"]["precio"]), 2250000.0)

        # 4. Verificar que un Cliente NO puede crear paquetes (403 Forbidden)
        res_client_login = self.client.post("/api/auth/login", json={
            "correo": "viajero.test@correo.com",
            "password": "Password123*"
        })
        token_cliente = res_client_login.get_json()["token"]

        res_forbidden = self.client.post(
            "/api/paquetes",
            json=nuevo_paquete,
            headers={"Authorization": f"Bearer {token_cliente}"}
        )
        self.assertEqual(res_forbidden.status_code, 403)
        self.assertFalse(res_forbidden.get_json()["success"])

if __name__ == "__main__":
    unittest.main()


class TestSolicitudesYFiltros(unittest.TestCase):
    """Cubre RF04/RF05 (solicitudes) y las correcciones de filtros y permisos del catálogo."""

    @classmethod
    def setUpClass(cls):
        from database import execute_query
        init_db()
        try:
            execute_query("DELETE FROM SOLICITUD_COTIZACION WHERE preferencias = 'prueba-automatica'")
            execute_query("DELETE FROM CLIENTE WHERE numeroDocumento = '777000111'")
            execute_query("DELETE FROM USUARIO WHERE correo = 'cliente.sol@correo.com'")
        except Exception:
            pass
        cls.client = create_app().test_client()
        cls.admin = {"Authorization": "Bearer " + cls.client.post(
            "/api/auth/login", json={"correo": "admin@rumbo.com", "password": "Admin123*"}).get_json()["token"]}
        reg = cls.client.post("/api/auth/register", json={
            "nombre": "Cliente Solicitud", "correo": "cliente.sol@correo.com", "password": "Cliente123*",
            "numeroDocumento": "777000111", "telefono": "3001234567"}).get_json()
        cls.cli = {"Authorization": "Bearer " + reg["token"]}

    def _body(self, **extra):
        from datetime import date, timedelta
        d = {"origen": "Cúcuta, Colombia", "destino": "Cartagena, Colombia",
             "fechaSalida": (date.today() + timedelta(days=20)).isoformat(),
             "fechaRegreso": (date.today() + timedelta(days=24)).isoformat(),
             "numeroViajeros": 2, "viajeros": "2 adultos", "presupuesto": 4500000, "preferencias": "prueba-automatica"}
        d.update(extra)
        return d

    def test_01_solicitud_requiere_sesion(self):
        self.assertEqual(self.client.post("/api/solicitudes", json=self._body()).status_code, 401)

    def test_02_validaciones_solicitud(self):
        self.assertEqual(self.client.post("/api/solicitudes", json=self._body(destino=""), headers=self.cli).status_code, 400)
        self.assertEqual(self.client.post("/api/solicitudes", json=self._body(presupuesto=0), headers=self.cli).status_code, 400)
        self.assertEqual(self.client.post("/api/solicitudes", json=self._body(fechaRegreso="2000-01-01"), headers=self.cli).status_code, 400)

    def test_03_flujo_cliente_envia_admin_gestiona(self):
        r = self.client.post("/api/solicitudes", json=self._body(), headers=self.cli)
        self.assertEqual(r.status_code, 201)
        sol = r.get_json()["data"]
        self.assertEqual(sol["estado"], "Nueva")
        self.assertEqual(sol["prioridad"], "Alta")
        # El cliente NO puede listar ni cambiar estados
        self.assertEqual(self.client.get("/api/solicitudes", headers=self.cli).status_code, 403)
        self.assertEqual(self.client.put(f"/api/solicitudes/{sol['idSolicitud']}", json={"estado": "Cotizada"}, headers=self.cli).status_code, 403)
        # El administrador sí
        lista = self.client.get("/api/solicitudes", headers=self.admin).get_json()
        self.assertTrue(any(s["id"] == sol["id"] for s in lista["data"]))
        ok = self.client.put(f"/api/solicitudes/{sol['idSolicitud']}", json={"estado": "En gestión"}, headers=self.admin)
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.get_json()["data"]["estado"], "En gestión")
        self.assertEqual(self.client.put(f"/api/solicitudes/{sol['idSolicitud']}", json={"estado": "Otro"}, headers=self.admin).status_code, 400)

    def test_04_duracion_filtra_por_dias(self):
        data = self.client.get("/api/paquetes?duracion=3").get_json()["data"]
        self.assertTrue(data and all(p["duracionDias"] == 3 for p in data))

    def test_05_inactivos_solo_admin(self):
        pub = self.client.get("/api/paquetes?estado=Inactivo").get_json()
        self.assertTrue(all(p["estado"] == "Activo" for p in pub["data"]))

    def test_06_cliente_no_modifica_paquetes(self):
        self.assertEqual(self.client.put("/api/paquetes/1", json={"precio": 1}, headers=self.cli).status_code, 403)
        self.assertEqual(self.client.put("/api/paquetes/1", json={"precio": 1}).status_code, 401)

    def test_07_registro_rechaza_clave_debil(self):
        r = self.client.post("/api/auth/register", json={"nombre": "x", "correo": "d@d.com", "password": "abc", "numeroDocumento": "1"})
        self.assertEqual(r.status_code, 400)


class TestCotizaciones(unittest.TestCase):
    """Cotización del administrador (condicional del acta): subtotal, descuento, total y vigencia."""

    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = create_app().test_client()
        tok = lambda c, p: {"Authorization": "Bearer " + cls.client.post("/api/auth/login", json={"correo": c, "password": p}).get_json()["token"]}
        cls.admin = tok("admin@rumbo.com", "Admin123*")
        from datetime import date, timedelta
        reg = cls.client.post("/api/auth/register", json={"nombre": "Cli Cot", "correo": "cli.cot@correo.com", "password": "Cliente123*", "numeroDocumento": "888000222"}).get_json()
        h = {"Authorization": "Bearer " + (reg.get("token") or cls.client.post("/api/auth/login", json={"correo": "cli.cot@correo.com", "password": "Cliente123*"}).get_json()["token"])}
        cls.cli = h
        s = cls.client.post("/api/solicitudes", headers=h, json={"destino": "Cusco, Perú", "fechaSalida": (date.today() + timedelta(days=40)).isoformat(),
            "fechaRegreso": (date.today() + timedelta(days=46)).isoformat(), "numeroViajeros": 4, "viajeros": "4 adultos", "presupuesto": 9000000}).get_json()["data"]
        cls.sid = s["idSolicitud"]

    def test_01_calcula_y_guarda(self):
        body = {"lineas": [{"t": "p", "concepto": "Perú", "cant": 4, "unit": 1000000}, {"t": "e", "concepto": "Seguro", "cant": 4, "unit": 95000}],
                "pct": 9, "valida": "2030-01-01", "condiciones": "Abono 30 %", "estado": "Borrador"}
        r = self.client.put(f"/api/solicitudes/{self.sid}/cotizacion", json=body, headers=self.admin)
        self.assertEqual(r.status_code, 200)
        c = r.get_json()["data"]
        self.assertEqual(c["subtotal"], 4380000)
        self.assertEqual(c["descuento"], 394200)
        self.assertEqual(c["total"], 3985800)
        # Segunda vez actualiza (no duplica)
        body["estado"] = "Generada"
        r2 = self.client.put(f"/api/solicitudes/{self.sid}/cotizacion", json=body, headers=self.admin).get_json()["data"]
        self.assertEqual(r2["id"], c["id"]); self.assertEqual(r2["estado"], "Generada")
        lista = self.client.get("/api/cotizaciones", headers=self.admin).get_json()["data"]
        self.assertEqual(len([x for x in lista if x["id"] == c["id"]]), 1)

    def test_02_validaciones_y_permisos(self):
        mal = {"lineas": [], "pct": 5}
        self.assertEqual(self.client.put(f"/api/solicitudes/{self.sid}/cotizacion", json=mal, headers=self.admin).status_code, 400)
        ok = {"lineas": [{"cant": 1, "unit": 10}], "pct": 150}
        self.assertEqual(self.client.put(f"/api/solicitudes/{self.sid}/cotizacion", json=ok, headers=self.admin).status_code, 400)
        self.assertEqual(self.client.put(f"/api/solicitudes/{self.sid}/cotizacion", json={"lineas": [{"cant": 1, "unit": 10}]}, headers=self.cli).status_code, 403)
        self.assertEqual(self.client.get("/api/cotizaciones", headers=self.cli).status_code, 403)
