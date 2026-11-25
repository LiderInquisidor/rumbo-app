(async () => {
  await Rumbo.listo;
  if (!Rumbo.proteger('Administrador')) return;
  const { $, esc, Sol, Cot, Paq, fmtCOP, parseCOP } = Rumbo;
  Rumbo.panel([['Panel de trabajo'], ['Cotizaciones']], 'Cotizaciones');

  const CAT = [['Seguro internacional', 95000], ['Tren panorámico Vistadome', 240000], ['Traslados privados', 120000], ['Guía local privado', 180000], ['Desayuno adicional', 45000], ['Tour Islas del Rosario', 210000], ['Tiquetes aéreos', 650000], ['Excursión adicional', 150000]];
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const fmtF = iso => iso ? iso.split('-').reverse().join('/') : '';
  const larga = iso => { const [y, m, d] = iso.split('-'); return `${d} ${MES[m - 1]} ${y}`; };
  const rangoTxt = (a, b) => { const [y1, m1, d1] = a.split('-'), [y2, m2, d2] = b.split('-'); return m1 === m2 && y1 === y2 ? `${d1} al ${d2} ${MES[m2 - 1]} ${y2}` : `${d1} ${MES[m1 - 1]} ${y1} al ${d2} ${MES[m2 - 1]} ${y2}`; };
  const sumar = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const pesos = n => fmtCOP(n).replace(' COP', '');
  const pax = s => (s.viajeros.match(/\d+/g) || []).reduce((a, n) => a + +n, 0) || 1;

  /* ---- Solicitud de trabajo ---- */
  const todas = Sol.listar();
  let solId = new URLSearchParams(location.search).get('sol');
  if (!solId || !Sol.obtener(solId)) solId = (todas.find(s => s.estado !== 'Cotizada') || todas[0])?.id;
  const sol = Sol.obtener(solId);
  if (!sol) { $('.page').innerHTML = '<p class="empty">No hay solicitudes para cotizar. Las solicitudes llegan desde el formulario de cotización de los clientes.</p>'; return; }
  const N = pax(sol);

  $('#eyebrow').textContent = 'COTIZACIÓN · ' + sol.id;
  $('#resumenSol').textContent = `Solicitud ${sol.id} · ${sol.cliente} · ${sol.destino} · ${N} ${N === 1 ? 'viajero' : 'viajeros'} · ${fmtF(sol.desde)} a ${fmtF(sol.hasta)}`;
  $('#selSol').innerHTML = todas.map(s => `<option value="${s.id}"${s.id === solId ? ' selected' : ''}>${esc(s.id)} · ${esc(s.cliente)} · ${esc(s.destino.split(',')[0])}</option>`).join('');
  $('#selSol').addEventListener('change', e => { location.search = '?sol=' + e.target.value; });

  /* ---- Estado de la cotización (se recupera si ya existe) ---- */
  const paquetes = Paq.listar();
  let cot = Cot.deSolicitud(solId);
  if (!cot) {
    const p = paquetes.find(x => x.destino === sol.destino) || paquetes[0];
    cot = {
      id: Cot.siguienteId(solId), sol: solId, estado: 'Borrador',
      lineas: p ? [{ t: 'p', id: p.id, concepto: p.nombre, cant: N, unit: p.precio }] : [],
      pct: N >= 6 ? 12 : N >= 4 ? 9 : 0,
      valida: (() => { const v = sumar(hoy, 15), tope = sumar(sol.desde, -1); return v < tope ? v : (tope > hoy ? tope : v); })(),
      condiciones: 'Abono del 30 % para reservar'
    };
  }
  const L = () => cot.lineas;
  const calc = () => {
    const sub = L().reduce((a, l) => a + l.cant * l.unit, 0), pct = Math.min(Math.max(+cot.pct || 0, 0), 100);
    const desc = Math.round(sub * pct / 100);
    return { sub, desc, total: sub - desc };
  };

  /* ---- Filas ---- */
  const optsCant = n => Array.from({ length: 30 }, (_, i) => `<option${i + 1 === n ? ' selected' : ''}>${i + 1}</option>`).join('');
  function fila(l, i) {
    const conceptos = l.t === 'p'
      ? paquetes.map(p => `<option value="${p.id}"${p.id === l.id ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')
      : (CAT.some(c => c[0] === l.concepto) ? '' : `<option selected>${esc(l.concepto)}</option>`) + CAT.map(c => `<option${c[0] === l.concepto ? ' selected' : ''}>${esc(c[0])}</option>`).join('');
    return `<div class="ln" data-i="${i}">
      <div class="control sel"><select data-f="concepto" aria-label="Concepto">${conceptos}</select></div>
      <div class="control sel"><select data-f="cant" aria-label="Cantidad">${optsCant(l.cant)}</select></div>
      <div class="control"><input class="num" data-f="unit" inputmode="numeric" value="${pesos(l.unit)}" aria-label="Valor unitario COP" autocomplete="off"></div>
      <div class="control"><input class="num" data-f="total" value="${pesos(l.cant * l.unit)}" readonly tabindex="-1" aria-label="Total COP"></div>
      <button type="button" class="del" data-del="${i}" aria-label="Quitar línea"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/></svg></button></div>`;
  }
  function filas() {
    const html = t => L().map((l, i) => l.t === t ? fila(l, i) : '').join('');
    $('#fp').innerHTML = html('p') || '<p class="vacia">No hay paquete en la cotización. Agrega un servicio o recarga la solicitud.</p>';
    $('#fa').innerHTML = html('a') || '<p class="vacia">Sin servicios adicionales.</p>';
  }

  /* ---- Resumen y vista previa ---- */
  function totales() {
    const c = calc();
    document.querySelectorAll('.ln').forEach(r => { const l = L()[+r.dataset.i]; if (l) r.querySelector('[data-f=total]').value = pesos(l.cant * l.unit); });
    $('#sub').textContent = pesos(c.sub);
    $('#desc').textContent = (c.desc ? '− ' : '') + pesos(c.desc);
    $('#tot').textContent = pesos(c.total);
    $('#pct').value = cot.pct;
    $('#valida').value = cot.valida; $('#condiciones').value = cot.condiciones;
    const titulo = L().find(l => l.t === 'p')?.concepto || sol.destino;
    $('#doc').innerHTML = `
      <div class="dtop">RUMBO · PROPUESTA DE VIAJE</div>
      <h3>${esc(titulo)}</h3>
      <div class="m">Cotización ${esc(cot.id)} · ${larga(hoy)}</div>
      <div>${N} ${N === 1 ? 'viajero' : 'viajeros'} · ${rangoTxt(sol.desde, sol.hasta)}<br>${cot.valida ? 'Vigencia hasta el ' + larga(cot.valida) : 'Vigencia por definir'}</div>
      <div class="h">SERVICIOS INCLUIDOS</div>
      <ul>${L().map(l => `<li>${esc(l.concepto)} ${l.t === 'p' ? `(${l.cant} pax)` : `· ${l.cant} ${l.cant === 1 ? 'viajero' : 'viajeros'}`}</li>`).join('') || '<li>—</li>'}</ul>
      <div class="tt"><span>TOTAL</span><b>${fmtCOP(c.total)}</b></div>
      <div class="f">${c.desc ? `Incluye descuento del ${cot.pct} %.<br>` : ''}Reserva sujeta a disponibilidad.<br>${esc(cot.condiciones || '')}</div>`;
  }
  function estado() {
    const g = cot.estado === 'Generada';
    $('#est').textContent = g ? 'Generada' : 'Borrador'; $('#est').classList.toggle('ok', g);
    $('#pdfPill').textContent = g ? 'PDF listo' : 'PDF pendiente'; $('#pdfPill').classList.toggle('ok', g);
    $('#descargar').disabled = !g;
  }
  const pintarTodo = () => { filas(); totales(); estado(); };

  function aviso(tipo, titulo, texto) { Rumbo.aviso($('#aviso'), tipo, titulo, texto); }
  function sucio() { if (cot.estado !== 'Borrador') { cot.estado = 'Borrador'; estado(); aviso('ok', 'Cotización modificada', 'Vuelve a generar el PDF para incluir los cambios.'); } else $('#aviso').hidden = true; $('#pdfErr').hidden = true; }

  /* ---- Edición ---- */
  $('#cot').addEventListener('change', e => {
    const r = e.target.closest('.ln'); if (!r) return;
    const l = L()[+r.dataset.i], f = e.target.dataset.f;
    if (f === 'cant') l.cant = +e.target.value;
    else if (f === 'concepto') {
      if (l.t === 'p') { const p = paquetes.find(x => x.id === e.target.value); Object.assign(l, { id: p.id, concepto: p.nombre, unit: p.precio }); }
      else { l.concepto = e.target.value; const c = CAT.find(x => x[0] === l.concepto); if (c) l.unit = c[1]; }
    } else return;
    sucio(); pintarTodo();
  });
  $('#cot').addEventListener('input', e => {
    const t = e.target, r = t.closest('.ln');
    if (r && t.dataset.f === 'unit') { L()[+r.dataset.i].unit = parseCOP(t.value); r.classList.remove('bad'); sucio(); const c = calc(); r.querySelector('[data-f=total]').value = pesos(L()[+r.dataset.i].cant * L()[+r.dataset.i].unit); $('#sub').textContent = pesos(c.sub); $('#desc').textContent = (c.desc ? '− ' : '') + pesos(c.desc); $('#tot').textContent = pesos(c.total); vista(); }
    else if (t.id === 'pct') { cot.pct = t.value === '' ? NaN : +t.value; t.classList.remove('bad'); sucio(); parcial(); }
    else if (t.id === 'valida' || t.id === 'condiciones') { cot[t.id] = t.value; const f = t.closest('.field'); f.classList.remove('is-error'); $('.msg', f).textContent = ''; sucio(); vista(); }
  });
  $('#cot').addEventListener('focusout', e => { const t = e.target; if (t.dataset?.f === 'unit') t.value = pesos(parseCOP(t.value)); });
  $('#cot').addEventListener('focusin', e => { const t = e.target; if (t.dataset?.f === 'unit') { const n = parseCOP(t.value); t.value = n ? String(n) : ''; } });
  const vista = () => { const keep = document.activeElement; const tmp = $('#pct').value; totales(); if (keep && keep.id === 'pct') $('#pct').value = tmp; };
  const parcial = () => { const c = calc(); $('#sub').textContent = pesos(c.sub); $('#desc').textContent = (c.desc ? '− ' : '') + pesos(c.desc); $('#tot').textContent = pesos(c.total); const v = $('#valida').value, k = $('#condiciones').value; const a = document.activeElement; totales(); $('#valida').value = v; $('#condiciones').value = k; if (a && a.id === 'pct') $('#pct').value = cot.pct; };
  $('#cot').addEventListener('click', e => {
    const d = e.target.closest('[data-del]');
    if (d) { L().splice(+d.dataset.del, 1); sucio(); pintarTodo(); return; }
    if (e.target.closest('#add')) { const c = CAT[0]; L().push({ t: 'a', concepto: c[0], cant: N, unit: c[1] }); sucio(); pintarTodo(); }
  });

  /* ---- Validación ---- */
  function validar(estricto) {
    const errs = []; document.querySelectorAll('.ln').forEach(r => r.classList.remove('bad'));
    document.querySelectorAll('#cot .field').forEach(f => { f.classList.remove('is-error'); $('.msg', f).textContent = ''; });
    $('#pct').classList.remove('bad');
    if (!L().length) errs.push('Agrega al menos un paquete o servicio.');
    L().forEach((l, i) => { if (!(l.cant >= 1) || !(l.unit > 0)) { errs.push('Revisa cantidades y valores unitarios.'); document.querySelector(`.ln[data-i="${i}"]`)?.classList.add('bad'); } });
    if (!(cot.pct >= 0 && cot.pct <= 30)) { errs.push('El descuento debe estar entre 0 % y 30 %.'); $('#pct').classList.add('bad'); }
    if (estricto) {
      const campo = (k, m) => { const f = $(`[data-field="${k}"]`); f.classList.add('is-error'); $('.msg', f).textContent = m; errs.push(m + '.'); };
      if (!cot.valida) campo('valida', 'Selecciona la fecha de vigencia');
      else if (cot.valida < hoy) campo('valida', 'La vigencia no puede ser anterior a hoy');
      else if (cot.valida >= sol.desde) campo('valida', 'Debe vencer antes de la salida (' + fmtF(sol.desde) + ')');
      if (!String(cot.condiciones).trim()) campo('condiciones', 'Escribe las condiciones comerciales');
      if (L().length && calc().total <= 0) errs.push('El total debe ser mayor que $0 COP.');
    }
    return [...new Set(errs)];
  }

  /* ---- PDF (documento de una página, sin librerías externas) ---- */
  function crearPDF() {
    const W = 595, H = 842, c = calc(); let s = '';
    const e = t => String(t).replace(/[–—−]/g, '-').replace(/★/g, '*').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const anc = (t, size) => [...String(t)].reduce((a, ch) => a + (/\d/.test(ch) ? .556 : ch === '.' || ch === ',' ? .278 : ch === ' ' ? .278 : ch === '$' ? .556 : ch === '-' ? .333 : ch === 'C' ? .722 : ch === 'O' ? .778 : ch === 'P' ? .667 : .56), 0) * size;
    const T = (x, y, t, size = 10, bold = false, gris = 0.1) => { s += `BT ${gris} g /F${bold ? 2 : 1} ${size} Tf ${x.toFixed(1)} ${y} Td (${e(t)}) Tj ET\n`; };
    const R = (xr, y, t, size, bold, gris) => T(xr - anc(t, size), y, t, size, bold, gris);
    const linea = (y, g = 0.82) => { s += `${g} G 0.6 w 50 ${y} m ${W - 50} ${y} l S\n`; };
    const parrafo = (x, y, t, size, gris, max = 95) => { let l = ''; const out = []; String(t).split(' ').forEach(w => { if ((l + ' ' + w).trim().length > max) { out.push(l); l = w; } else l = (l + ' ' + w).trim(); }); out.push(l); out.forEach((ln, k) => T(x, y - k * (size + 4), ln, size, false, gris)); return y - out.length * (size + 4); };

    const titulo = L().find(l => l.t === 'p')?.concepto || sol.destino;
    T(50, 790, 'RUMBO  ·  PROPUESTA DE VIAJE', 10, true);
    T(50, 748, titulo, 24, true);
    T(50, 728, `Cotización ${cot.id}  ·  ${larga(hoy)}`, 9, false, 0.45);
    linea(712);
    T(50, 690, 'Cliente', 8, true, 0.45); T(50, 675, sol.cliente, 11);
    T(220, 690, 'Viaje', 8, true, 0.45); T(220, 675, `${N} ${N === 1 ? 'viajero' : 'viajeros'}  ·  ${rangoTxt(sol.desde, sol.hasta)}`, 11);
    T(50, 650, 'Destino', 8, true, 0.45); T(50, 635, sol.destino, 11);
    T(220, 650, 'Vigencia', 8, true, 0.45); T(220, 635, 'Hasta el ' + larga(cot.valida), 11);

    let y = 598;
    T(50, y, 'SERVICIOS INCLUIDOS', 8, true, 0.45);
    T(330, y, 'CANT.', 8, true, 0.45); R(470, y, 'VALOR UNIT.', 8, true, 0.45); R(W - 50, y, 'TOTAL', 8, true, 0.45);
    y -= 8; linea(y); y -= 20;
    L().slice(0, 18).forEach(l => {
      T(50, y, l.concepto.length > 46 ? l.concepto.slice(0, 45) + '…' : l.concepto, 10);
      T(336, y, String(l.cant), 10); R(470, y, pesos(l.unit), 10); R(W - 50, y, pesos(l.cant * l.unit), 10);
      y -= 20;
    });
    y -= 4; linea(y); y -= 22;
    T(330, y, 'Subtotal', 10, false, 0.4); R(W - 50, y, pesos(c.sub), 10); y -= 18;
    if (c.desc) { T(330, y, `Descuento (${cot.pct} %)`, 10, false, 0.4); R(W - 50, y, '- ' + pesos(c.desc), 10, false, 0.2); y -= 18; }
    y -= 6; T(330, y, 'TOTAL COP', 11, true); R(W - 50, y - 2, pesos(c.total), 17, true); y -= 46;
    linea(y); y -= 22;
    T(50, y, 'CONDICIONES', 8, true, 0.45); y -= 16;
    y = parrafo(50, y, cot.condiciones, 10, 0.1);
    y = parrafo(50, y - 2, 'Reserva sujeta a disponibilidad. Los valores están expresados en pesos colombianos (COP).', 9, 0.45);
    T(50, 50, 'Rumbo · Viajes que se quedan contigo.', 8, false, 0.55);

    const o = [null,
      '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
      `<< /Length ${s.length} >>\nstream\n${s}endstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
    let out = '%PDF-1.4\n'; const off = [];
    for (let i = 1; i <= 6; i++) { off[i] = out.length; out += `${i} 0 obj\n${o[i]}\nendobj\n`; }
    const x = out.length;
    out += 'xref\n0 7\n0000000000 65535 f \n' + off.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
    return Uint8Array.from(out, ch => ch.charCodeAt(0) & 255);
  }
  const descargarPDF = () => {
    const url = URL.createObjectURL(new Blob([crearPDF()], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = `Cotizacion-${cot.id}.pdf`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  /* ---- Acciones ---- */
  const guardar = () => {
    Cot.guardar(cot);
    const act = Sol.obtener(solId).estado; /* lee el estado vigente, no la copia inicial */
    if (act === 'Nueva' || (act === 'Cotizada' && cot.estado !== 'Generada')) Sol.actualizar(solId, { estado: 'En gestión' });
  };
  $('#borrador').addEventListener('click', () => {
    const errs = validar(false);
    if (errs.length) { aviso('err', 'No se guardó el borrador', errs.join(' ')); return; }
    cot.estado = 'Borrador'; guardar(); estado();
    aviso('ok', 'Borrador guardado', `${cot.id} se guardó para ${sol.cliente}. Puedes seguir editándola cuando quieras.`);
  });
  function generar() {
    $('#pdfErr').hidden = true;
    const errs = validar(true);
    if (errs.length) { aviso('err', 'No se generó la cotización', errs.join(' ')); return; }
    try {
      crearPDF();
      cot.estado = 'Generada'; guardar(); Sol.actualizar(solId, { estado: 'Cotizada' }); estado();
      aviso('ok', 'Cotización generada', `${cot.id} está lista. La solicitud ${sol.id} pasó a “Cotizada”. Descarga el PDF para enviarlo al cliente.`);
    } catch (err) {
      console.error(err); $('#aviso').hidden = true; $('#pdfErr').hidden = false;
    }
  }
  $('#cot').addEventListener('submit', e => { e.preventDefault(); generar(); });
  $('#reintentar').addEventListener('click', generar);
  $('#descargar').addEventListener('click', () => { try { descargarPDF(); } catch (err) { console.error(err); $('#pdfErr').hidden = false; } });

  pintarTodo();
})();
