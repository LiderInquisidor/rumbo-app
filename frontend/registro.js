(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const form = $('#registro');

  const reglas = {
    nombre: v => !v.trim() ? 'Escribe tu nombre completo'
      : v.trim().split(/\s+/).length < 2 ? 'Escribe tu nombre y apellido' : '',
    documento: v => {
      const t = v.replace(/[.\s-]/g, '');
      if (!t) return 'Escribe tu número de documento';
      if ($('#tipoDoc').value === 'PA') return /^[A-Za-z0-9]{6,12}$/.test(t) ? '' : 'El pasaporte debe tener entre 6 y 12 caracteres';
      return /^\d{5,12}$/.test(t) ? '' : 'Usa solo números (entre 5 y 12 dígitos)';
    },
    correo: v => !v.trim() ? 'Escribe tu correo electrónico'
      : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Revisa el formato: nombre@dominio.com',
    telefono: v => {
      const d = v.replace(/\D/g, '');
      if (!d) return 'Escribe tu teléfono celular';
      return (d.length === 10 || (d.length === 12 && d.startsWith('57'))) ? '' : 'Ingresa un celular válido de 10 dígitos';
    },
    clave: v => !v ? 'Crea una contraseña'
      : v.length < 8 ? 'Usa 8 o más caracteres'
      : !/[A-Z]/.test(v) ? 'Incluye al menos una mayúscula'
      : !/\d/.test(v) ? 'Incluye al menos un número' : ''
  };
  const nombres = { nombre: 'tu nombre completo', documento: 'tu número de documento', correo: 'tu correo electrónico', telefono: 'tu teléfono celular', clave: 'tu contraseña' };

  function validar(id, mostrarVacio = true) {
    const input = $('#' + id), campo = input.closest('.field');
    const err = reglas[id](input.value), vacio = !input.value.trim();
    const ver = !!err && (mostrarVacio || !vacio);
    campo.classList.toggle('is-valid', !err);
    campo.classList.toggle('is-error', ver);
    $('.msg', campo).textContent = ver ? err : '';
    return err;
  }

  function aviso(tipo, titulo, texto) {
    const a = $('#aviso');
    a.hidden = false;
    a.className = 'notice ' + tipo;
    a.querySelector('use').setAttribute('href', tipo === 'ok' ? '#i-ok' : '#i-err');
    $('#avisoTitulo').textContent = titulo;
    $('#avisoTexto').textContent = texto;
  }

  /* Medidor de seguridad de la contraseña */
  function medidor() {
    const v = $('#clave').value, m = $('.meter'), h = $('#claveHint');
    const nivel = !v ? 0 : [v.length >= 8, /[A-Z]/.test(v), /\d/.test(v), /[^A-Za-z0-9]/.test(v) || v.length >= 12].filter(Boolean).length;
    m.dataset.level = nivel;
    h.className = 'hint' + (nivel >= 3 ? '' : ' weak');
    h.textContent = !v ? '8 o más caracteres, una mayúscula y un número.'
      : nivel >= 3 ? 'Segura · 8 o más caracteres, una mayúscula y un número.'
      : 'Aún débil · 8 o más caracteres, una mayúscula y un número.';
  }

  Object.keys(reglas).forEach(id => {
    const el = $('#' + id);
    el.addEventListener('blur', () => validar(id, true));
    el.addEventListener('input', () => {
      if (id === 'clave') medidor();
      if (el.closest('.field').classList.contains('is-error')) validar(id, false);
    });
  });
  $('#tipoDoc').addEventListener('change', () => { if ($('#documento').value) validar('documento', true); });
  $('#terminos').addEventListener('change', () => { if ($('#terminos').checked) $('#terminosMsg').textContent = ''; });
  medidor();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fallos = Object.keys(reglas).filter(id => validar(id, true));
    const terminos = $('#terminos').checked;
    $('#terminosMsg').textContent = terminos ? '' : 'Debes aceptar los términos y el tratamiento de datos para continuar';
    if (fallos.length) {
      const id = fallos[0], vacio = !$('#' + id).value.trim();
      aviso('err', (vacio ? 'Escribe ' : 'Revisa ') + nombres[id], 'Completa los campos marcados antes de crear la cuenta.');
      $('#' + id).focus();
      return;
    }
    if (!terminos) { aviso('err', 'Acepta los términos', 'Necesitamos tu autorización para crear la cuenta.'); return; }

    const r = await Rumbo.Auth.registrarCliente({
      nombre: $('#nombre').value, tipoDoc: $('#tipoDoc').value, documento: $('#documento').value.trim(),
      correo: $('#correo').value, telefono: $('#telefono').value.trim(), ciudad: $('#ciudad').value, clave: $('#clave').value
    });
    if (!r.ok) {
      const c = $('#correo').closest('.field');
      c.classList.remove('is-valid'); c.classList.add('is-error');
      $('.msg', c).textContent = r.error;
      aviso('err', 'No pudimos crear tu cuenta', r.error + ' Prueba iniciando sesión.');
      return;
    }
    await Rumbo.Auth.login($('#correo').value, $('#clave').value, true);
    aviso('ok', '¡Bienvenida, ' + r.usuario.nombre.split(' ')[0] + '!', 'Tu cuenta quedó creada. Te llevamos al catálogo de paquetes…');
    $('.submit', form).disabled = true;
    setTimeout(() => { location.href = 'catalogo.html'; }, 1100);
  });

  /* Selector de apariencia (comparte la preferencia con el resto del sitio) */
  document.querySelectorAll('[data-theme-set]').forEach(b => b.addEventListener('click', () => {
    document.documentElement.dataset.theme = b.dataset.themeSet;
    document.querySelectorAll('[data-theme-set]').forEach(x => x.setAttribute('aria-checked', x === b));
    try { localStorage.setItem('rumbo-tema', b.dataset.themeSet); } catch {}
  }));
  try { const t = localStorage.getItem('rumbo-tema'); if (t) document.querySelector(`[data-theme-set="${t}"]`)?.click(); } catch {}
})();
