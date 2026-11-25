(async () => {
  await Rumbo.listo;
  const { $, esc, fmtCOP, parseCOP } = Rumbo;

  /* Solo clientes (o el admin probando) con sesión: si no hay, va al login y regresa aquí */
  const ses = Rumbo.Auth.sesion();
  if (!ses) { location.replace('login.html?next=' + encodeURIComponent('cotizacion.html' + location.search)); return; }

  const IMG = { 'Cartagena, Colombia': 'img/cartagena-card.jpg', 'San Andrés, Colombia': 'img/sanandres.jpg', 'Bogotá, Colombia': 'img/bogota.jpg', 'Medellín, Colombia': 'img/guatape.jpg' };
  const GRAD = 'linear-gradient(135deg,#27334f,#c47a4d)';
  const ORIGENES = ['Bogotá, Colombia', 'Medellín, Colombia', 'Cali, Colombia', 'Barranquilla, Colombia', 'Cartagena, Colombia', 'Cúcuta, Colombia', 'Bucaramanga, Colombia', 'Otra ciudad'];
  const PREFS = ['Cultura y ciudad', 'Playa', 'Hotel 4★', 'Desayuno incluido', 'Naturaleza', 'Gastronomía', 'Tiquetes incluidos'];
  const ACOM = ['1 habitación doble', '1 habitación sencilla', '1 habitación triple', '2 habitaciones dobles', 'Lo define mi asesor'];
  const NOMBRES = { destino: 'el destino', origen: 'la ciudad de origen', salida: 'la fecha de salida', regreso: 'la fecha de regreso', presupuesto: 'el presupuesto' };

  const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const fmtF = iso => iso ? iso.split('-').reverse().join('/') : '';
  const sumar = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const diff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const opts = (l, vacio) => (vacio ? `<option value="">${vacio}</option>` : '') + l.map(x => `<option>${esc(x)}</option>`).join('');

  const publicados = Rumbo.Paq.listar().filter(p => p.estado === 'Publicado');
  const idPaq = new URLSearchParams(location.search).get('paquete');
  const paqUrl = publicados.find(p => p.id === idPaq) || null;

  /* ---- Controles ---- */
  const destinos = [...new Set(['Cartagena, Colombia', 'San Andrés, Colombia', 'Bogotá, Colombia', 'Medellín, Colombia', 'Santa Marta, Colombia', 'Cusco, Perú', 'Cancún, México', ...publicados.map(p => p.destino)])];
  $('#destino').innerHTML = opts(destinos, 'Selecciona un destino');
  $('#origen').innerHTML = opts(ORIGENES, 'Selecciona tu ciudad');
  $('#adultos').innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1} ${i ? 'adultos' : 'adulto'}</option>`).join('');
  $('#menores').innerHTML = Array.from({ length: 9 }, (_, i) => `<option value="${i}">${i} ${i === 1 ? 'menor' : 'menores'}</option>`).join('');
  $('#acom').innerHTML = opts(ACOM);
  $('#adultos').value = '2';
  $('#salida').min = hoy;
  $('#prefs').innerHTML = PREFS.map(p => `<button type="button" class="chip" aria-pressed="false" data-p="${esc(p)}">${esc(p)}</button>`).join('') + '<button type="button" class="chip add" id="addPref">+ Añadir preferencia</button>';

  /* Ciudad de origen: la ciudad con la que se registró el cliente */
  if (ORIGENES.includes(ses.ciudad)) $('#origen').value = ses.ciudad;

  /* ---- Lectura y escritura del estado del formulario ---- */
  const leer = () => ({
    destino: $('#destino').value, origen: $('#origen').value, salida: $('#salida').value, regreso: $('#regreso').value,
    adultos: +$('#adultos').value, menores: +$('#menores').value, presupuestoTxt: $('#presupuesto').value, presupuesto: parseCOP($('#presupuesto').value),
    prefs: [...document.querySelectorAll('#prefs .chip[data-p][aria-pressed="true"]')].map(c => c.dataset.p),
    acom: $('#acom').value, notas: $('#notas').value.trim()
  });
  const poner = d => {
    $('#destino').value = d.destino || ''; $('#origen').value = d.origen || $('#origen').value; $('#salida').value = d.salida || ''; $('#regreso').value = d.regreso || '';
    $('#adultos').value = d.adultos || 2; $('#menores').value = d.menores || 0;
    $('#presupuesto').value = d.presupuesto > 0 ? fmtCOP(d.presupuesto) : ''; $('#acom').value = d.acom || ACOM[0]; $('#notas').value = d.notas || '';
    (d.prefs || []).forEach(p => chip(p, true));
  };
  function chip(texto, activo) {
    let c = [...document.querySelectorAll('#prefs .chip[data-p]')].find(x => x.dataset.p.toLowerCase() === texto.toLowerCase());
    if (!c) {
      c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.dataset.p = texto; c.textContent = texto;
      $('#addPref').before(c);
    }
    c.setAttribute('aria-pressed', activo);
  }

  /* ---- Estado inicial: paquete elegido > borrador guardado > vacío ---- */
  const KB = 'rumbo-borrador-cot-' + ses.id;
  let borrador = null;
  try { borrador = JSON.parse(localStorage.getItem(KB) || 'null'); } catch {}
  if (paqUrl) {
    const dias = parseInt(paqUrl.duracion, 10) || 3, sal = paqUrl.salida && paqUrl.salida >= hoy ? paqUrl.salida : '';
    poner({ destino: paqUrl.destino, salida: sal, regreso: sal ? sumar(sal, dias - 1) : '', adultos: 2, menores: 0, presupuesto: paqUrl.precio * 2 });
  } else if (borrador) poner(borrador);
  else $('#acom').value = ACOM[0];

  /* ---- Cálculos de resumen ---- */
  const viajerosTxt = d => `${d.adultos} ${d.adultos === 1 ? 'adulto' : 'adultos'}` + (d.menores ? ` y ${d.menores} ${d.menores === 1 ? 'menor' : 'menores'}` : '');
  const referencia = d => paqUrl && paqUrl.destino === d.destino ? paqUrl : publicados.find(p => p.destino === d.destino);

  function errores(d) {
    const e = {};
    if (!d.destino) e.destino = 'Selecciona un destino';
    if (!d.origen) e.origen = 'Selecciona tu ciudad de origen';
    if (!d.salida) e.salida = 'Selecciona la fecha de salida';
    else if (d.salida < hoy) e.salida = 'La fecha de salida no puede ser anterior a hoy';
    if (!d.regreso) e.regreso = 'Selecciona la fecha de regreso';
    else if (d.salida && d.regreso <= d.salida) e.regreso = `Debe ser posterior a la salida: ${fmtF(d.salida)}.`;
    if (!d.presupuestoTxt.trim()) e.presupuesto = 'Ingresa tu presupuesto total';
    else if (d.presupuesto <= 0) e.presupuesto = 'El presupuesto debe ser mayor que $0 COP';
    return e;
  }

  function pintar() {
    const d = leer(), e = errores(d), ok = !Object.keys(e).length, ref = referencia(d);
    /* Resumen */
    $('#quien').textContent = 'Solicitud de ' + ses.nombre;
    $('#s-dest').textContent = d.destino || 'Por definir';
    const fechasOk = d.salida && d.regreso && d.regreso > d.salida;
    $('#s-fechas').textContent = d.salida && d.regreso ? `${fmtF(d.salida)} – ${fmtF(d.regreso)}` : d.salida ? fmtF(d.salida) + ' – por definir' : 'Por definir';
    $('#s-dur').textContent = fechasOk ? `${diff(d.salida, d.regreso) + 1} días / ${diff(d.salida, d.regreso)} noches` : 'Por definir';
    $('#s-via').textContent = viajerosTxt(d) + ' · ' + d.acom.toLowerCase();
    $('#s-pref').textContent = d.prefs.length ? d.prefs.join(', ') : 'Sin preferencias específicas';
    $('#s-pres').textContent = d.presupuesto > 0 ? fmtCOP(d.presupuesto).replace(' COP', '') : '$0';
    $('#s-presn').textContent = `COP · para ${viajerosTxt(d)} · no es un cobro`;
    $('#s-ref').textContent = ref
      ? ` La tarifa de referencia del paquete ${ref.nombre} es ${fmtCOP(ref.precio * d.adultos)} para ${d.adultos} ${d.adultos === 1 ? 'adulto' : 'adultos'}. Tu asesor confirmará servicios y disponibilidad.`
      : ' Tu asesor armará la propuesta según tu presupuesto y tus preferencias, y confirmará servicios y disponibilidad.';
    $('#s-correo').textContent = `Recibirás la propuesta en ${ses.correo}. Enviar no reserva cupos ni implica una compra.`;
    /* Foto y etiqueta */
    const src = ref?.imagen || IMG[d.destino];
    $('#foto').style.setProperty('--g', GRAD);
    $('#foto').style.background = GRAD;
    $('#foto img')?.remove();
    if (src) { const im = new Image(); im.alt = d.destino; im.src = src; im.onerror = () => im.remove(); $('#foto').prepend(im); }
    $('#etiqueta').textContent = paqUrl && paqUrl.destino === d.destino ? paqUrl.nombre : d.destino ? d.destino.split(',')[0] : 'Cotización a medida';
    /* Contador, píldora y pasos */
    $('#cnt').textContent = `${$('#notas').value.length} / 500 caracteres`;
    const p = $('#estadoPill'); p.textContent = ok ? 'Datos completos' : 'Faltan datos'; p.classList.toggle('warn', !ok);
    pasos(ok ? 2 : 1);
  }

  function pasos(activo, enviada) {
    const S = [['Tu viaje', 'Datos completados', 'Cuéntanos cómo viajar'], ['Revisa tu solicitud', 'Confirma que todo esté bien', 'Confirma que todo esté bien'], ['Recibe tu propuesta', 'Te contactaremos en 24 h hábiles', 'Te contactaremos en 24 h hábiles']];
    $('#pasos').innerHTML = S.map(([t, hecho, sub], i) => {
      const n = i + 1, done = enviada ? n <= 3 : n < activo, on = !enviada && n === activo;
      return `<div class="step-i ${done ? 'done' : on ? 'on' : ''}"${on ? ' aria-current="step"' : ''}>
        <span class="n">${done ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.500 4.500 4.500L19 7.500"/></svg>' : n}</span>
        <div><strong>${t}</strong><small>${done && i === 0 ? hecho : sub}</small></div></div>`;
    }).join('');
  }

  const guardar = () => {
    const d = leer();
    try { localStorage.setItem(KB, JSON.stringify(d)); $('#borrador').textContent = 'Borrador guardado en tu cuenta'; } catch {}
  };

  function marcar(e) {
    document.querySelectorAll('#cotizar .field').forEach(f => { f.classList.remove('is-error'); const m = $('.msg', f); if (m) m.textContent = ''; });
    Object.entries(e).forEach(([k, msg]) => { const f = $(`[data-field="${k}"]`); f.classList.add('is-error'); $('.msg', f).textContent = msg; });
  }
  function aviso(tipo, titulo, texto) {
    const a = $('#aviso'); a.hidden = false; a.className = 'notice ' + tipo;
    a.querySelector('use').setAttribute('href', tipo === 'ok' ? '#i-ok' : '#i-err');
    $('#avisoTitulo').textContent = titulo; $('#avisoTexto').textContent = texto;
  }

  /* ---- Eventos ---- */
  const cambio = () => {
    const f = $('#regreso'), s = $('#salida').value;
    f.min = s ? sumar(s, 1) : '';
    pintar(); guardar();
  };
  $('#cotizar').addEventListener('input', e => {
    const f = e.target.closest('.field');
    if (f?.classList.contains('is-error')) { f.classList.remove('is-error'); $('.msg', f).textContent = ''; }
    $('#aviso').hidden = true; cambio();
  });
  $('#cotizar').addEventListener('change', e => { if (e.target.id === 'salida' && $('#regreso').value && $('#regreso').value <= e.target.value) $('#regreso').value = ''; cambio(); });
  $('#presupuesto').addEventListener('focus', e => { const n = parseCOP(e.target.value); if (n > 0) e.target.value = String(n); });
  $('#presupuesto').addEventListener('blur', e => { if (e.target.value.trim()) e.target.value = fmtCOP(parseCOP(e.target.value)); pintar(); guardar(); });

  $('#prefs').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    if (c.id === 'addPref') {
      const inp = document.createElement('input'); inp.className = 'chip-in'; inp.maxLength = 30; inp.placeholder = 'Ej. Spa, buceo…'; inp.setAttribute('aria-label', 'Nueva preferencia');
      c.replaceWith(inp); inp.focus();
      const cerrar = ok => {
        const t = inp.value.trim(), b = document.createElement('button'); b.type = 'button'; b.className = 'chip add'; b.id = 'addPref'; b.textContent = '+ Añadir preferencia';
        inp.replaceWith(b);
        if (ok && t) chip(t, true);
        pintar(); guardar();
      };
      inp.addEventListener('keydown', k => { if (k.key === 'Enter') { k.preventDefault(); cerrar(true); } else if (k.key === 'Escape') cerrar(false); });
      inp.addEventListener('blur', () => { if (inp.isConnected) cerrar(true); });
      return;
    }
    c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'); pintar(); guardar();
  });

  $('#cotizar').addEventListener('submit', async e => {
    e.preventDefault();
    const d = leer(), err = errores(d);
    if (Object.keys(err).length) {
      marcar(err);
      aviso('err', 'Faltan datos para enviar', 'Corrige los campos marcados. También son obligatorios el destino, al menos 1 viajero y el presupuesto.');
      document.querySelector(`[data-field="${Object.keys(err)[0]}"] input, [data-field="${Object.keys(err)[0]}"] select`)?.focus();
      return;
    }
    marcar({});
    const btn = $('#enviar'); btn.disabled = true;
    const r = await Rumbo.Sol.crear({
      numeroViajeros: d.adultos + d.menores,
      cliente: ses.nombre, correo: ses.correo, origen: d.origen, destino: d.destino, desde: d.salida, hasta: d.regreso,
      viajeros: viajerosTxt(d), acomodacion: d.acom, presupuesto: d.presupuesto, paquete: paqUrl?.id || '',
      preferencias: [d.prefs.join(', '), d.notas].filter(Boolean).join('. ') || 'Sin preferencias específicas.'
    });
    if (!r.ok) { btn.disabled = false; aviso('err', 'No pudimos enviar tu solicitud', r.error); return; }
    const s = r.solicitud;
    try { localStorage.removeItem(KB); } catch {}
    $('#flujo').hidden = true; $('#exito').hidden = false;
    $('#exitoTxt').textContent = `Recibimos tu solicitud ${s.id} el ${fmtF(s.recibida)}. En máximo 24 horas hábiles te enviaremos una propuesta para ${d.destino.split(',')[0]}, del ${fmtF(d.salida)} al ${fmtF(d.regreso)}, para ${viajerosTxt(d)}.`;
    pasos(3, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ---- Sesión y tema ---- */
  Rumbo.menuUsuario($('#usuario'));
  document.querySelectorAll('[data-theme-set]').forEach(b => b.addEventListener('click', () => {
    document.documentElement.dataset.theme = b.dataset.themeSet;
    document.querySelectorAll('[data-theme-set]').forEach(x => x.setAttribute('aria-checked', x === b));
    try { localStorage.setItem('rumbo-tema', b.dataset.themeSet); } catch {}
  }));
  try { const t = localStorage.getItem('rumbo-tema'); if (t) document.querySelector(`[data-theme-set="${t}"]`)?.click(); } catch {}

  cambio();
})();
