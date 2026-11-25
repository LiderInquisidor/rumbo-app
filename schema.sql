-- Esquema de Base de Datos - Rumbo Agencia de Viajes (MVP)
-- Compatible con MySQL 8.0+

CREATE DATABASE IF NOT EXISTS agencia_viajes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE agencia_viajes;

-- 1. Tabla ROL
CREATE TABLE IF NOT EXISTS ROL (
    idRol INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(255)
);

-- 2. Tabla USUARIO
CREATE TABLE IF NOT EXISTS USUARIO (
    idUsuario INT AUTO_INCREMENT PRIMARY KEY,
    idRol INT NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    contrasenaHash VARCHAR(255) NOT NULL,
    estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo',
    creadoEn TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idRol) REFERENCES ROL(idRol) ON UPDATE CASCADE
);

-- 3. Tabla CLIENTE
CREATE TABLE IF NOT EXISTS CLIENTE (
    idUsuario INT PRIMARY KEY,
    tipoDocumento VARCHAR(20) NOT NULL,
    numeroDocumento VARCHAR(30) NOT NULL UNIQUE,
    telefono VARCHAR(30),
    direccion VARCHAR(200),
    fechaRegistro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idUsuario) REFERENCES USUARIO(idUsuario) ON DELETE CASCADE
);

-- 4. Tabla PAQUETE_TURISTICO
CREATE TABLE IF NOT EXISTS PAQUETE_TURISTICO (
    idPaquete INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    destino VARCHAR(100) NOT NULL,
    tipoViaje VARCHAR(50) NOT NULL,
    duracion VARCHAR(50) NOT NULL,
    duracionDias INT NOT NULL DEFAULT 1,
    precio DECIMAL(12,2) NOT NULL,
    descripcion TEXT,
    itinerario TEXT,
    imagen VARCHAR(500),
    disponibilidad INT NOT NULL DEFAULT 10,
    condiciones TEXT,
    estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo',
    creadoEn TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizadoEn TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. Tabla SERVICIO
CREATE TABLE IF NOT EXISTS SERVICIO (
    idServicio INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    costoReferencia DECIMAL(12,2) DEFAULT 0
);

-- 6. Tabla PAQUETE_SERVICIO
CREATE TABLE IF NOT EXISTS PAQUETE_SERVICIO (
    idPaquete INT NOT NULL,
    idServicio INT NOT NULL,
    PRIMARY KEY (idPaquete, idServicio),
    FOREIGN KEY (idPaquete) REFERENCES PAQUETE_TURISTICO(idPaquete) ON DELETE CASCADE,
    FOREIGN KEY (idServicio) REFERENCES SERVICIO(idServicio) ON DELETE CASCADE
);

-- 7. Tabla SOLICITUD_COTIZACION (Keirys)
CREATE TABLE IF NOT EXISTS SOLICITUD_COTIZACION (
    idSolicitud INT AUTO_INCREMENT PRIMARY KEY,
    idUsuario INT NOT NULL,
    idPaquete INT NULL,
    origen VARCHAR(100),
    destino VARCHAR(100) NOT NULL,
    fechaSalida DATE,
    fechaRegreso DATE,
    numeroViajeros INT NOT NULL DEFAULT 1,
    presupuestoEstimado DECIMAL(12,2),
    preferencias TEXT,
    estado ENUM('Nueva', 'En gestión', 'Cotizada') DEFAULT 'Nueva',
    creadoEn TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idUsuario) REFERENCES USUARIO(idUsuario) ON UPDATE CASCADE,
    FOREIGN KEY (idPaquete) REFERENCES PAQUETE_TURISTICO(idPaquete) ON UPDATE CASCADE
);

-- 8. Tabla COTIZACION (Keirys)
CREATE TABLE IF NOT EXISTS COTIZACION (
    idCotizacion INT AUTO_INCREMENT PRIMARY KEY,
    idSolicitud INT NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    descuento DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) NOT NULL,
    fechaVigencia DATE NOT NULL,
    condiciones TEXT,
    estado ENUM('Registrada', 'Lista', 'Aceptada', 'Reemplazada') DEFAULT 'Registrada',
    creadoEn TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idSolicitud) REFERENCES SOLICITUD_COTIZACION(idSolicitud) ON UPDATE CASCADE
);

-- SEED DATA (Datos iniciales según DERS)
INSERT INTO ROL (idRol, nombre, descripcion) VALUES
(1, 'Administrador', 'Control total administrativo y de paquetes'),
(2, 'Cliente', 'Usuario registrado para cotizar y comparar')
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);

