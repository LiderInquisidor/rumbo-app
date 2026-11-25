/* Rumbo · núcleo compartido (sesión con roles, paquetes, validación y panel).
   Conectado al backend Flask (/api) con JWT; los datos viven en MySQL (Railway). */
const Rumbo = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const db = {
    get(k, d) { try { const v = localStorage.getItem('rumbo-' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('rumbo-' + k, JSON.stringify(v)); } catch {} }
  };

  /* Tema compartido con login y registro */
  try { const t = localStorage.getItem('rumbo-tema'); if (t) document.documentElement.dataset.theme = t; } catch {}

  /* ---------- Conexión con el backend (Flask + MySQL en Railway) ---------- */
  /* El mismo servidor entrega estas páginas y la API, por eso la ruta base es relativa.
     Si el frontend se publica en otro dominio, define antes de app.js: window.RUMBO_API = 'https://tu-app.up.railway.app' */
  const API = (window.RUMBO_API || '') + '/api';

  const ses = {
    get() { try { return JSON.parse(sessionStorage.getItem('rumbo-ses') || localStorage.getItem('rumbo-ses')); } catch { return null; } },
    set(u, recordar) {
      const s = JSON.stringify({ id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, ciudad: u.direccion || '', token: u.token });
      try { sessionStorage.removeItem('rumbo-ses'); localStorage.removeItem('rumbo-ses'); (recordar ? localStorage : sessionStorage).setItem('rumbo-ses', s); } catch {}
    },
    clear() { try { sessionStorage.removeItem('rumbo-ses'); localStorage.removeItem('rumbo-ses'); } catch {} }
  };

  /* Llamada a la API: devuelve { ok, status, error, datos }. Si el token venció, cierra la sesión. */
  async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
    const s = ses.get();
    let r;
    try {
      r = await fetch(API + ruta, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(s?.token ? { Authorization: 'Bearer ' + s.token } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
      });
    } catch { return { ok: false, status: 0, error: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.', datos: {} }; }
    const datos = await r.json().catch(() => ({}));
    if (r.status === 401 && s && !/login|registro/.test(location.pathname)) {
      ses.clear(); location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));
    }
    return { ok: r.ok && datos.success !== false, status: r.status, error: datos.error || (r.ok ? '' : 'Error del servidor.'), datos };
  }

  /* ---------- Usuarios y sesión (RF01 / RNF01) ---------- */
  const Auth = {
    sesion: ses.get,
    /* Los clientes siempre se crean con rol Cliente; el rol Administrador no se puede elegir desde el registro. */
    async registrarCliente({ nombre, tipoDoc, documento, correo, telefono, ciudad, clave }) {
      const r = await api('/auth/register', { metodo: 'POST', cuerpo: {
        nombre: nombre.trim(), tipoDocumento: tipoDoc, numeroDocumento: documento, correo: String(correo).trim(),
        telefono: String(telefono || '').replace(/\D/g, ''), direccion: ciudad, password: clave } });
      return r.ok ? { ok: true, usuario: r.datos.usuario } : { ok: false, error: r.error };
    },
    async login(correo, clave, recordar) {
      const r = await api('/auth/login', { metodo: 'POST', cuerpo: { correo: String(correo).trim(), password: clave } });
      if (!r.ok) return { ok: false, error: r.status === 401 ? 'Correo o contraseña incorrectos.' : r.error };
      const u = { ...r.datos.usuario, token: r.datos.token };
      ses.set(u, recordar);
      return { ok: true, usuario: u };
    },
    salir() { ses.clear(); location.href = 'login.html'; },
    destinoPorRol: rol => rol === 'Administrador' ? 'paquetes-modificar.html' : 'catalogo.html'
  };
  /* Protege una pantalla en el navegador; la seguridad real la aplica el backend con el token (JWT). */
  const proteger = rol => {
    const s = ses.get();
    if (!s || s.rol !== rol) { location.replace('login.html'); return null; }
    return s;
  };

  /* ---------- Paquetes (RF11 / RF12 / RF13) ---------- */
  const TIPOS = ['Sol y playa', 'Cultura y ciudad', 'Naturaleza y aventura'];
  const TIPO_DESTINO = { 'Cartagena, Colombia': 'Cultura y ciudad', 'San Andrés, Colombia': 'Sol y playa', 'Bogotá, Colombia': 'Cultura y ciudad', 'Medellín, Colombia': 'Naturaleza y aventura', 'Santa Marta, Colombia': 'Sol y playa', 'Cusco, Perú': 'Naturaleza y aventura', 'Cancún, México': 'Sol y playa', 'Ciudad de México, México': 'Cultura y ciudad' };
  const DESTINOS = ['Cartagena, Colombia', 'San Andrés, Colombia', 'Bogotá, Colombia', 'Medellín, Colombia', 'Santa Marta, Colombia', 'Cusco, Perú', 'Cancún, México', 'Ciudad de México, México'];
  const DURACIONES = ['3 días / 2 noches', '4 días / 3 noches', '5 días / 4 noches', '6 días / 5 noches', '8 días / 7 noches'];
  const SERVICIOS = ['Hotel 4 estrellas', 'Desayuno', 'Traslados', 'Tour Islas del Rosario', 'Seguro de viaje', 'Guía local', 'Tiquetes aéreos'];

  /* Backend -> forma que usan las pantallas (id "PQ-001", cupos, Publicado/Borrador) */
  const dePaq = r => ({
    id: 'PQ-' + String(r.idPaquete).padStart(3, '0'), nombre: r.nombre, destino: r.destino,
    tipo: TIPOS.includes(r.tipoViaje) ? r.tipoViaje : (TIPO_DESTINO[r.destino] || 'Cultura y ciudad'),
    duracion: r.duracion, descripcion: r.descripcion || '', servicios: r.servicios || [], precio: Number(r.precio),
    cupos: r.disponibilidad, condiciones: r.condiciones || '', salida: String(r.fechaSalida || '').slice(0, 10), imagen: r.imagen || '',
    estado: r.estado === 'Activo' ? 'Publicado' : 'Borrador', operacion: false, editado: r.actualizadoEn || r.creadoEn
  });
  const numId = id => parseInt(String(id).replace(/\D/g, ''), 10);
  const aApi = (d, previo) => ({
    nombre: d.nombre.trim(), destino: d.destino, tipoViaje: TIPO_DESTINO[d.destino] || previo?.tipo || 'Cultura y ciudad',
    duracion: d.duracion, duracionDias: parseInt(d.duracion, 10) || 1, precio: d.precio, descripcion: d.descripcion.trim(),
    imagen: d.imagen || '', disponibilidad: d.cupos, condiciones: d.condiciones.trim(), fechaSalida: d.salida, servicios: d.servicios || []
  });

  let _paq = [], _sol = [];
  async function cargarPaquetes() {
    const admin = ses.get()?.rol === 'Administrador';
    const r = await api('/paquetes' + (admin ? '?estado=' : ''));   /* el administrador también ve los inactivos */
    if (r.ok) _paq = r.datos.data.map(dePaq);
    return r;
  }
  const Paq = {
    listar: () => _paq,
    obtener: id => _paq.find(p => p.id === id),
    nombreExiste: (n, excepto) => _paq.some(p => p.id !== excepto && p.nombre.trim().toLowerCase() === n.trim().toLowerCase()),
    async crear(d) {
      const r = await api('/paquetes', { metodo: 'POST', cuerpo: aApi(d) });
      if (!r.ok) return { ok: false, error: r.error };
      const p = dePaq(r.datos.data); _paq.push(p);
      return { ok: true, paquete: p };
    },
    async actualizar(id, d) {
      const r = await api('/paquetes/' + numId(id), { metodo: 'PUT', cuerpo: aApi(d, _paq.find(p => p.id === id)) });
      if (!r.ok) return { ok: false, error: r.error };
      const p = dePaq(r.datos.data), i = _paq.findIndex(x => x.id === id);
      if (i >= 0) _paq[i] = p; else _paq.push(p);
      return { ok: true, paquete: p };
    }
  };

  /* ---------- Solicitudes de cotización (RF04 / RF05) ---------- */
  async function cargarSolicitudes() {
    const r = await api('/solicitudes');
    if (r.ok) _sol = r.datos.data;
    return r;
  }
  const Sol = {
    listar: () => _sol,
    obtener: id => _sol.find(s => s.id === id),
    /* Solicitud nueva desde el cliente (RF04) */
    async crear(d) {
      const r = await api('/solicitudes', { metodo: 'POST', cuerpo: {
        origen: d.origen, destino: d.destino, fechaSalida: d.desde, fechaRegreso: d.hasta, numeroViajeros: d.numeroViajeros,
        viajeros: d.viajeros, acomodacion: d.acomodacion, presupuesto: d.presupuesto, paquete: d.paquete, preferencias: d.preferencias } });
      return r.ok ? { ok: true, solicitud: r.datos.data } : { ok: false, error: r.error };
    },
    /* Cambio de estado por el administrador (RF05) */
    async actualizar(id, d) {
      const i = _sol.findIndex(x => x.id === id), previa = _sol[i];
      if (i >= 0) _sol[i] = { ..._sol[i], ...d };            /* la pantalla ve el cambio de inmediato */
      const r = await api('/solicitudes/' + String(id).split('-').pop(), { metodo: 'PUT', cuerpo: { estado: d.estado } });
      if (!r.ok) { if (i >= 0) _sol[i] = previa; return { ok: false, error: r.error }; }
      if (i >= 0) _sol[i] = r.datos.data;
      return { ok: true, solicitud: r.datos.data };
    }
  };

  /* ---------- Cotizaciones del administrador (CU07 / CU08) ---------- */
  let _cot = [];
  async function cargarCotizaciones() {
    const r = await api('/cotizaciones');
    if (r.ok) _cot = r.datos.data;
    return r;
  }
  const idCot = sol => 'COT-' + (2086 + parseInt(String(sol).split('-').pop(), 10));
  const Cot = {
    listar: () => _cot,
    deSolicitud: sol => _cot.find(c => c.sol === sol) || null,
    siguienteId: sol => idCot(sol),
    /* Guarda al instante en pantalla y confirma con el servidor; avisa si no se pudo guardar. */
    guardar(c) {
      const copia = { ...c, actualizada: new Date().toISOString() };
      const i = _cot.findIndex(x => x.id === c.id);
      if (i >= 0) _cot[i] = copia; else _cot.push(copia);
      api('/solicitudes/' + String(c.sol).split('-').pop() + '/cotizacion', { metodo: 'PUT',
        cuerpo: { lineas: c.lineas, pct: c.pct, valida: c.valida, condiciones: c.condiciones, estado: c.estado } })
        .then(r => { if (!r.ok) toast('No se pudo guardar la cotización: ' + r.error); });
      return copia;
    }
  };

  /* Carga inicial: las pantallas esperan esto con "await Rumbo.listo" antes de pintar. */
  const listo = (async () => {
    await cargarPaquetes();
    if (ses.get()?.rol === 'Administrador') await Promise.all([cargarSolicitudes(), cargarCotizaciones()]);
  })();

  /* ---------- Formato y validación ---------- */
  const parseCOP = s => { const n = parseInt(String(s).replace(/\D/g, ''), 10) || 0; return /-|−/.test(s) ? -n : n; };
  const fmtCOP = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('es-CO').replace(/,/g, '.') + ' COP';
  const fmtFecha = iso => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

  function validar(d, excepto) {
    const e = {};
    const n = d.nombre.trim();
    if (!n) e.nombre = 'Ingresa el nombre del paquete';
    else if (n.length < 3 || n.length > 80) e.nombre = 'Usa entre 3 y 80 caracteres';
    else if (Paq.nombreExiste(n, excepto)) e.nombre = 'Ya existe un paquete con ese nombre';
    if (!d.destino) e.destino = 'Selecciona un destino';
    if (!d.duracion) e.duracion = 'Selecciona la duración';
    if (!d.salida) e.salida = 'Selecciona la fecha de salida';
    else if (!excepto && d.salida < new Date().toISOString().slice(0, 10)) e.salida = 'La fecha de salida no puede ser anterior a hoy';
    const desc = d.descripcion.trim();
    if (!desc) e.descripcion = 'Escribe la descripción del paquete';
    else if (desc.length < 20) e.descripcion = 'Describe el paquete con al menos 20 caracteres';
    if (!String(d.precioTxt).trim()) e.precio = 'Ingresa el precio por persona';
    else if (d.precio <= 0) e.precio = 'El precio debe ser mayor que $0 COP.';
    if (!Number.isInteger(d.cupos) || d.cupos < 1 || d.cupos > 999) e.cupos = 'Ingresa un número entero de cupos (de 1 a 999)';
    if (!d.condiciones.trim()) e.condiciones = 'Escribe las condiciones comerciales';
    return e;
  }

  /* ---------- Formulario de paquete (lo usan registrar y modificar) ---------- */
  const opts = (lista, vacio) => `<option value="">${vacio}</option>` + lista.map(x => `<option>${esc(x)}</option>`).join('');
  const camposHTML = () => `
    <div class="field" data-field="nombre"><label for="p-nombre">Nombre del paquete *</label>
      <div class="control"><input id="p-nombre" name="nombre" maxlength="80" placeholder="Ej. Cartagena esencial" autocomplete="off"></div><p class="msg"></p></div>
    <div class="row">
      <div class="field" data-field="destino"><label for="p-destino">Destino *</label>
        <div class="control sel"><select id="p-destino" name="destino">${opts(DESTINOS, 'Selecciona un destino')}</select></div><p class="msg"></p></div>
      <div class="field" data-field="duracion"><label for="p-duracion">Duración *</label>
        <div class="control sel"><select id="p-duracion" name="duracion">${opts(DURACIONES, 'Selecciona la duración')}</select></div><p class="msg"></p></div>
    </div>
    <div class="field" data-field="salida"><label for="p-salida">Fecha de salida *</label>
      <div class="control"><input id="p-salida" name="salida" type="date"></div><p class="msg"></p></div>
    <div class="field" data-field="descripcion"><label for="p-descripcion">Descripción *</label>
      <div class="control"><textarea id="p-descripcion" name="descripcion" rows="3" placeholder="Qué incluye la experiencia y qué la hace especial"></textarea></div><p class="msg"></p></div>
    <div class="field" data-field="imagen"><label for="p-imagen-f">Imagen de referencia del destino (opcional)</label>
      <div class="img-up">
        <div class="img-prev" hidden><img alt="Vista previa de la imagen del paquete"><div><strong>Imagen cargada</strong><small>Se mostrará en el catálogo y en el detalle.</small><button type="button" class="btn" data-quitar-img>Quitar imagen</button></div></div>
        <label class="img-drop" for="p-imagen-f"><span>Subir imagen</span><small>JPG, PNG o WebP · máximo 5 MB</small></label>
        <input type="file" id="p-imagen-f" class="sr" accept="image/jpeg,image/png,image/webp">
        <input type="hidden" name="imagen">
      </div><p class="msg"></p></div>
    <div class="field"><label id="l-serv">Servicios incluidos</label>
      <div class="chips" role="group" aria-labelledby="l-serv">${SERVICIOS.map(s => `<button type="button" class="chip" aria-pressed="false" data-serv="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>
    <div class="row">
      <div class="field" data-field="precio"><label for="p-precio">Precio por persona *</label>
        <div class="control"><input id="p-precio" name="precio" inputmode="numeric" placeholder="$0 COP" autocomplete="off"></div><p class="msg"></p></div>
      <div class="field" data-field="cupos"><label for="p-cupos">Disponibilidad (cupos) *</label>
        <div class="control"><input id="p-cupos" name="cupos" inputmode="numeric" placeholder="Ej. 24" autocomplete="off"></div><p class="msg"></p></div>
    </div>
    <div class="field" data-field="condiciones"><label for="p-condiciones">Condiciones *</label>
      <div class="control"><textarea id="p-condiciones" name="condiciones" rows="3" placeholder="Abono, tarifas, exclusiones y cancelación"></textarea></div><p class="msg"></p></div>`;

  const leer = f => {
    const v = n => f.elements[n].value;
    const precioTxt = v('precio');
    return {
      nombre: v('nombre'), destino: v('destino'), duracion: v('duracion'), salida: v('salida'), descripcion: v('descripcion'),
      servicios: [...f.querySelectorAll('.chip[aria-pressed="true"]')].map(c => c.dataset.serv),
      precioTxt, precio: parseCOP(precioTxt), cupos: /^\s*\d+\s*$/.test(v('cupos')) ? parseInt(v('cupos'), 10) : NaN,
      condiciones: v('condiciones'), imagen: v('imagen')
    };
  };
  const poner = (f, p) => {
    const set = (n, val) => { f.elements[n].value = val ?? ''; };
    set('nombre', p?.nombre); set('destino', p?.destino); set('duracion', p?.duracion); set('salida', p?.salida); set('descripcion', p?.descripcion);
    set('precio', p ? fmtCOP(p.precio) : ''); set('cupos', p ? p.cupos : ''); set('condiciones', p?.condiciones); set('imagen', p?.imagen); pintarImagen(f);
    f.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', !!p?.servicios.includes(c.dataset.serv)));
    limpiar(f);
  };
  /* Imagen de referencia: se reduce a 1200 px y se guarda como JPEG para no llenar el almacenamiento del navegador */
  function comprimir(file) {
    return new Promise((ok, mal) => {
      const r = new FileReader();
      r.onerror = mal;
      r.onload = () => {
        const im = new Image();
        im.onerror = mal;
        im.onload = () => {
          const k = Math.min(1, 1200 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/jpeg', 0.8));
        };
        im.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }
  function pintarImagen(f) {
    const v = f.elements.imagen?.value, box = f.querySelector('.img-prev'); if (!box) return;
    box.hidden = !v; if (v) box.querySelector('img').src = v;
    const t = f.querySelector('.img-drop span'); if (t) t.textContent = v ? 'Cambiar imagen' : 'Subir imagen';
  }
  function limpiar(f) { f.querySelectorAll('.field').forEach(c => { c.classList.remove('is-error'); const m = $('.msg', c); if (m) m.textContent = ''; }); }
  function marcar(f, errs) {
    limpiar(f);
    Object.entries(errs).forEach(([k, msg]) => {
      const c = f.querySelector(`[data-field="${k}"]`);
      c.classList.add('is-error'); $('.msg', c).textContent = msg;
    });
    const primero = Object.keys(errs)[0];
    if (primero) f.querySelector(`[data-field="${primero}"] input, [data-field="${primero}"] select, [data-field="${primero}"] textarea`)?.focus();
  }
  /* Conecta chips, formato de precio y limpieza de errores al escribir. onCambio se llama en cada cambio. */
  function enlazar(f, onCambio) {
    f.addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (!c) return;
      c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'); onCambio?.();
    });
    f.addEventListener('input', e => {
      const c = e.target.closest('.field'); if (c?.classList.contains('is-error')) { c.classList.remove('is-error'); $('.msg', c).textContent = ''; }
      onCambio?.();
    });
    const fi = f.querySelector('#p-imagen-f');
    if (fi) {
      fi.addEventListener('change', async () => {
        const file = fi.files[0]; if (!file) return;
        const campo = f.querySelector('[data-field="imagen"]');
        const err = m => { campo.classList.add('is-error'); $('.msg', campo).textContent = m; };
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) err('Usa una imagen JPG, PNG o WebP.');
        else if (file.size > 5 * 1024 * 1024) err('La imagen pesa más de 5 MB. Elige una más liviana.');
        else {
          try { f.elements.imagen.value = await comprimir(file); campo.classList.remove('is-error'); $('.msg', campo).textContent = ''; pintarImagen(f); onCambio?.(); }
          catch { err('No se pudo leer la imagen. Prueba con otro archivo.'); }
        }
        fi.value = '';
      });
      f.addEventListener('click', e => { if (e.target.closest('[data-quitar-img]')) { f.elements.imagen.value = ''; pintarImagen(f); onCambio?.(); } });
    }
    f.elements.precio.addEventListener('blur', e => { const t = e.target.value; if (t.trim()) e.target.value = fmtCOP(parseCOP(t)); onCambio?.(); });
    f.elements.precio.addEventListener('focus', e => { const n = parseCOP(e.target.value); if (n > 0) e.target.value = String(n); });
  }

  /* ---------- Aviso (usa los estilos .notice de styles.css) ---------- */
  const aviso = (el, tipo, titulo, texto, extra = '') => {
    const ic = tipo === 'ok'
      ? '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m8 12.3 2.8 2.8L16 9.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5v5.5M12 16.2v.1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>';
    el.hidden = false; el.className = 'notice ' + tipo;
    el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24">${ic}</svg><div><strong>${esc(titulo)}</strong><span>${esc(texto)}</span>${extra}</div>`;
  };

  /* ---------- Estructura del panel ---------- */
  /* [texto, enlace]. Sin enlace = módulo futuro (muestra aviso "Próximamente"). */
  const MENU = [['Resumen'], ['Clientes'], ['Oportunidades'], ['Solicitudes', 'solicitudes.html'], ['Cotizaciones', 'cotizacion-crear.html'], ['Reportes'], ['Notificaciones'], ['Integración CRM']];
  function panel(migas, activo = 'Paquetes turísticos') {
    const s = ses.get(), ini = s.nombre.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
    $('#side').innerHTML = `
      <a class="side-logo" href="paquetes-modificar.html">Rumbo.<i></i></a>
      <p class="side-h">Agencia de viajes</p>
      <nav aria-label="Módulos">${MENU.map(([t, h]) => `<a href="${h || '#'}" class="side-a${t === activo ? ' on' : ''}"${t === activo ? ' aria-current="page"' : ''}${h ? '' : ' title="Próximamente"'}>${t}</a>`).join('')}</nav>
      <p class="side-h">Administración</p>
      <nav aria-label="Administración">
        <a href="paquetes-modificar.html" class="side-a${activo === 'Paquetes turísticos' ? ' on' : ''}"${activo === 'Paquetes turísticos' ? ' aria-current="page"' : ''}>Paquetes turísticos</a>
        <a href="#" class="side-a" title="Próximamente">Promociones</a>
      </nav>
      <div class="side-user"><span class="av">${esc(ini)}</span><div><strong>${esc(s.nombre)}</strong><small>${esc(s.rol)}</small></div></div>`;
    $('#top').innerHTML = `
      <div class="top-l"><button type="button" class="burger" id="burgerA" aria-label="Abrir menú" aria-expanded="false" aria-controls="side">${ICO_MENU}</button>
      <div class="crumbs">${migas.map(([t, h]) => h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`).join('<i>/</i>')}</div></div>
      <div class="top-r"><span class="pill"><i></i>En línea</span>
        <div id="menuUsuario"></div></div>`;
    menuUsuario($('#menuUsuario'), true);
    menuAdmin();
  }

  /* ---------- Menú de la cuenta: iniciales + nombre, se despliega con "Cerrar sesión" ---------- */
  function menuUsuario(el, enPanel = false) {
    if (!el) return;
    const s = ses.get();
    if (!s) { el.innerHTML = '<a class="btn-login" href="login.html">Iniciar sesión</a>'; return; }
    const ini = s.nombre.split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase();
    const admin = s.rol === 'Administrador';
    const items = enPanel ? '' : admin
      ? '<a role="menuitem" href="paquetes-modificar.html">Ir al panel de administración</a>'
      : '<a role="menuitem" href="cotizacion.html">Cotización a medida</a>';
    el.className = 'um';
    el.innerHTML = `
      <button type="button" class="um-b" aria-haspopup="menu" aria-expanded="false" aria-label="Menú de la cuenta de ${esc(s.nombre)}">
        <span class="um-av">${esc(ini)}</span><span class="um-n">${esc(s.nombre.split(' ')[0])}</span>
        <svg class="um-c" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="um-m" role="menu" hidden>
        <div class="um-h"><strong>${esc(s.nombre)}</strong><small>${esc(s.correo || '')}</small><span class="um-r">${esc(s.rol)}</span></div>
        ${items}
        <button type="button" role="menuitem" class="um-out" data-salir>Cerrar sesión</button>
      </div>`;
    const b = $('.um-b', el), m = $('.um-m', el);
    const abrir = o => { m.hidden = !o; b.setAttribute('aria-expanded', o); if (o) ($('[role=menuitem]', m) || b).focus(); };
    b.addEventListener('click', e => { e.stopPropagation(); abrir(m.hidden); });
    m.addEventListener('click', e => { if (e.target.closest('[data-salir]')) Auth.salir(); });
    document.addEventListener('click', e => { if (!m.hidden && !el.contains(e.target)) abrir(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !m.hidden) { abrir(false); b.focus(); } });
    m.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const l = [...m.querySelectorAll('[role=menuitem]')], i = l.indexOf(document.activeElement);
      l[(i + (e.key === 'ArrowDown' ? 1 : l.length - 1)) % l.length].focus();
    });
  }

  /* ---------- Menú en móvil: los enlaces de navegación se ocultan por debajo de 860 px ---------- */
  const ICO_MENU = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  const ICO_X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  function conmutar(btn, abierto) {
    btn.setAttribute('aria-expanded', abierto); btn.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú'); btn.innerHTML = abierto ? ICO_X : ICO_MENU;
  }
  function menuPublico() {
    const nav = $('.nav'), links = nav && $('.links', nav), der = nav && $('.nav-right', nav);
    if (!links || !der) return;
    links.id = links.id || 'menuPrincipal';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'burger'; b.setAttribute('aria-controls', links.id); conmutar(b, false);
    der.append(b);
    const cerrar = () => { nav.classList.remove('open'); conmutar(b, false); };
    b.addEventListener('click', () => { const o = !nav.classList.contains('open'); nav.classList.toggle('open', o); conmutar(b, o); });
    links.addEventListener('click', e => { if (e.target.closest('a')) cerrar(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
    window.matchMedia('(min-width:861px)').addEventListener('change', cerrar);
  }
  function menuAdmin() {
    const b = $('#burgerA'); if (!b) return;
    const fondo = document.createElement('div'); fondo.className = 'backdrop'; document.body.appendChild(fondo);
    const cerrar = () => { document.body.classList.remove('menu-open'); conmutar(b, false); };
    b.addEventListener('click', () => { const o = !document.body.classList.contains('menu-open'); document.body.classList.toggle('menu-open', o); conmutar(b, o); });
    fondo.addEventListener('click', cerrar);
    $('#side').addEventListener('click', e => { if (e.target.closest('a')) cerrar(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
    window.matchMedia('(min-width:861px)').addEventListener('change', cerrar);
  }
  menuPublico();

  /* ---------- Aviso breve y enlaces "Próximamente" ---------- */
  let tt;
  function toast(msg) {
    let t = $('#rumbo-toast');
    if (!t) {
      const st = document.createElement('style');
      st.textContent = '#rumbo-toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,12px);z-index:99;max-width:min(92vw,420px);padding:11px 18px;border-radius:9px;background:var(--card,#0d1322);color:var(--text);border:1px solid var(--accent-soft);box-shadow:0 12px 30px -10px rgba(0,0,0,.5);font-size:.74rem;line-height:1.4;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}#rumbo-toast.on{opacity:1;transform:translate(-50%,0)}';
      document.head.appendChild(st);
      t = document.createElement('div'); t.id = 'rumbo-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2600);
  }
  /* Cualquier enlace "#" (módulos aún no construidos) ya no salta al inicio: avisa en su lugar. */
  document.addEventListener('click', e => {
    const l = e.target.closest('a[href="#"]');
    if (!l || e.defaultPrevented) return;
    e.preventDefault();
    toast(l.title || 'Este apartado llegará en un próximo módulo.');
  });

  return { listo, TIPOS, $, esc, Auth, Paq, Sol, Cot, toast, menuUsuario, proteger, validar, camposHTML, leer, poner, marcar, limpiar, enlazar, aviso, panel, fmtCOP, fmtFecha, parseCOP };
})();
