(async () => {
  await Rumbo.listo;
  const { $, esc, fmtCOP } = Rumbo;
  const TIPO = { 'Cartagena, Colombia': 'Cultura y ciudad', 'San Andrés, Colombia': 'Sol y playa', 'Bogotá, Colombia': 'Cultura y ciudad', 'Medellín, Colombia': 'Naturaleza y aventura', 'Santa Marta, Colombia': 'Sol y playa', 'Cusco, Perú': 'Naturaleza y aventura', 'Cancún, México': 'Sol y playa' };
  const GRAD = { 'Sol y playa': 'linear-gradient(135deg,#0e5c73,#3fb7b0)', 'Cultura y ciudad': 'linear-gradient(135deg,#27334f,#c47a4d)', 'Naturaleza y aventura': 'linear-gradient(135deg,#1d4a3a,#7aa65b)' };
  const IMG = { 'Cartagena, Colombia': 'img/cartagena-card.jpg', 'San Andrés, Colombia': 'img/sanandres.jpg', 'Bogotá, Colombia': 'img/bogota.jpg', 'Medellín, Colombia': 'img/guatape.jpg' };
  const TODOS = ['Hotel 4 estrellas', 'Desayuno', 'Traslados', 'Tour Islas del Rosario', 'Seguro de viaje', 'Guía local', 'Tiquetes aéreos'];
  const HAB = { Sencilla: 1.35, Doble: 1, Triple: 0.95 };
  const MAX = 3;
  const ses = Rumbo.Auth.sesion();
  const fmtF = iso => iso ? iso.split('-').reverse().join('/') : 'Por definir';

  const id = new URLSearchParams(location.search).get('id');
  const p = Rumbo.Paq.obtener(id);
  /* Los clientes solo ven paquetes publicados; el administrador también ve los borradores */
  if (!p || (p.estado !== 'Publicado' && ses?.rol !== 'Administrador')) {
    $('#vista').innerHTML = '<div class="vacio"><strong>No encontramos este paquete.</strong><span>Puede que ya no esté disponible. Explora el resto del catálogo.</span><a class="btn primary" href="catalogo.html">Explorar paquetes →</a></div>';
  } else {
    document.title = `Rumbo · ${p.nombre}`;
    const tipo = p.tipo || TIPO[p.destino] || 'Cultura y ciudad', img = p.imagen || IMG[p.destino];
    const noInc = TODOS.filter(s => !p.servicios.includes(s));
    let cmp = []; try { cmp = JSON.parse(sessionStorage.getItem('rumbo-comparar') || '[]'); } catch {}
    const lista = (a, c) => a.length ? `<ul class="lst ${c}">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p style="font-size:.8rem;color:var(--muted)">Nada que destacar.</p>';
    $('#vista').innerHTML = `
      <section class="hero" style="--g:${GRAD[tipo]}">${img ? `<img src="${esc(img)}" alt="${esc(p.destino)}" onerror="this.remove()">` : ''}
        <div class="in"><span class="tag">${esc(tipo)}${p.estado !== 'Publicado' ? ' · ' + esc(p.estado) : ''}</span><h1>${esc(p.nombre)}</h1><p>${esc(p.destino)} · ${esc(p.duracion)}</p></div></section>
      <div class="cols">
        <div>
          <div class="facts" style="margin-top:0;margin-bottom:28px"></div>
          <div class="sec"><h2>Sobre este viaje</h2><p>${esc(p.descripcion)}</p></div>
          <div class="sec"><h2>Qué incluye</h2>${lista(p.servicios, '')}</div>
          <div class="sec"><h2>No incluido</h2>${lista(noInc, 'no')}</div>
          <div class="sec"><h2>Condiciones</h2><div class="cond">${esc(p.condiciones)}<br>Sujeto a disponibilidad. Impuestos incluidos.</div></div>
        </div>
        <aside class="buy" aria-label="Reserva y precio">
          <small>Desde · por persona</small>
          <div class="pr"><span id="precio"></span> <em>COP</em></div>
          <small id="tarifa">Tarifa base en habitación doble.</small>
          <label for="pax">Viajeros</label>
          <select id="pax">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}"${n === 2 ? ' selected' : ''}>${n} ${n === 1 ? 'adulto' : 'adultos'}</option>`).join('')}</select>
          <label for="hab">Habitación</label>
          <select id="hab">${Object.keys(HAB).map(k => `<option${k === 'Doble' ? ' selected' : ''}>${k}</option>`).join('')}</select>
          <div class="est"><span id="estTxt"></span><b id="estTot"></b></div>
          <a class="btn primary" href="cotizacion.html?paquete=${esc(p.id)}">Solicitar cotización →</a>
          <button type="button" class="btn" id="cmp"></button>
          <a class="verc" id="verc" href="comparar.html" hidden></a>
          <p class="n">Enviar la solicitud no reserva cupos ni implica una compra. Un asesor te responde en máximo 24 horas hábiles.</p>
        </aside>
      </div>`;
    $('.facts').innerHTML = `
      <div><small>Duración</small><b>${esc(p.duracion)}</b></div>
      <div><small>Fecha de salida</small><b>${fmtF(p.salida)}</b></div>
      <div><small>Disponibilidad</small><b class="${p.cupos <= 8 ? 'low' : 'okc'}">${p.cupos <= 8 ? 'Últimos ' : ''}${p.cupos} cupos</b></div>`;

    const px = () => Math.round(p.precio * HAB[$('#hab').value] / 1000) * 1000;
    const calc = () => {
      const n = +$('#pax').value;
      $('#precio').textContent = fmtCOP(px()).replace(' COP', '');
      $('#tarifa').textContent = `Habitación ${$('#hab').value.toLowerCase()}. Doble es la tarifa base; sencilla +35 %, triple −5 %.`;
      $('#estTxt').textContent = `Estimado para ${n} ${n === 1 ? 'adulto' : 'adultos'}`;
      $('#estTot').textContent = fmtCOP(px() * n);
    };
    const botonCmp = () => {
      const en = cmp.includes(p.id);
      $('#cmp').textContent = en ? 'Quitar de la comparación' : 'Agregar para comparar';
      $('#verc').hidden = !cmp.length;
      $('#verc').textContent = `Ver comparación (${cmp.length} de ${MAX}) →`;
      $('#verc').href = 'comparar.html?ids=' + cmp.join(',');
    };
    $('#pax').addEventListener('change', calc); $('#hab').addEventListener('change', calc);
    $('#cmp').addEventListener('click', () => {
      if (cmp.includes(p.id)) cmp = cmp.filter(x => x !== p.id);
      else if (cmp.length >= MAX) { Rumbo.toast(`Solo puedes comparar hasta ${MAX} paquetes. Quita uno primero.`); return; }
      else cmp.push(p.id);
      try { sessionStorage.setItem('rumbo-comparar', JSON.stringify(cmp)); } catch {}
      botonCmp();
    });
    calc(); botonCmp();
  }

  Rumbo.menuUsuario($('#usuario'));
  document.querySelectorAll('[data-theme-set]').forEach(b => b.addEventListener('click', () => {
    document.documentElement.dataset.theme = b.dataset.themeSet;
    document.querySelectorAll('[data-theme-set]').forEach(x => x.setAttribute('aria-checked', x === b));
    try { localStorage.setItem('rumbo-tema', b.dataset.themeSet); } catch {}
  }));
  try { const t = localStorage.getItem('rumbo-tema'); if (t) document.querySelector(`[data-theme-set="${t}"]`)?.click(); } catch {}
})();
