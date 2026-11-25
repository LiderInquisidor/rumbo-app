(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const form = $('#login'), btn = $('#enviar');

  const reglas = {
    correo: v => !v.trim() ? 'Escribe tu correo electrónico'
      : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Revisa el formato: nombre@dominio.com',
    clave: v => v ? '' : 'Escribe tu contraseña'
  };
  const nombres = { correo: 'tu correo electrónico', clave: 'tu contraseña' };

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

  Object.keys(reglas).forEach(id => {
    const el = $('#' + id);
    el.addEventListener('blur', () => validar(id, true));
    el.addEventListener('input', () => {
      if (el.closest('.field').classList.contains('is-error')) validar(id, false);
    });
  });

  $('#ver').addEventListener('click', e => {
    const input = $('#clave'), mostrar = input.type === 'password';
    input.type = mostrar ? 'text' : 'password';
    e.currentTarget.textContent = mostrar ? 'Ocultar' : 'Mostrar';
    e.currentTarget.setAttribute('aria-pressed', mostrar);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const fallos = Object.keys(reglas).filter(id => validar(id, true));
    if (fallos.length) {
      const id = fallos[0], vacio = !$('#' + id).value.trim();
      aviso('err', (vacio ? 'Escribe ' : 'Revisa ') + nombres[id], 'Completa los campos marcados para poder entrar a tu cuenta.');
      $('#' + id).focus();
      return;
    }
    btn.disabled = true;
    btn.firstChild.textContent = 'Entrando… ';
    (async () => {
      const r = await Rumbo.Auth.login($('#correo').value, $('#clave').value, $('#recordar').checked);
      btn.disabled = false;
      btn.firstChild.textContent = 'Iniciar sesión ';
      if (!r.ok) { aviso('err', 'No pudimos iniciar sesión', r.error + ' Verifica tus datos e inténtalo de nuevo.'); return; }
      const next = new URLSearchParams(location.search).get('next');
      const destino = /^[\w-]+\.html(\?[\w=&,.-]*)?$/.test(next || '') ? next : Rumbo.Auth.destinoPorRol(r.usuario.rol);
      if (destino) { location.href = destino; return; }
      aviso('ok', 'Hola, ' + r.usuario.nombre.split(' ')[0], 'Sesión iniciada como Cliente. Tu espacio de destinos y cotizaciones llegará en el próximo módulo.');
    })();
  });

  /* Selector de apariencia (comparte la preferencia con el registro) */
  document.querySelectorAll('[data-theme-set]').forEach(b => b.addEventListener('click', () => {
    document.documentElement.dataset.theme = b.dataset.themeSet;
    document.querySelectorAll('[data-theme-set]').forEach(x => x.setAttribute('aria-checked', x === b));
    try { localStorage.setItem('rumbo-tema', b.dataset.themeSet); } catch {}
  }));
  try {
    const t = localStorage.getItem('rumbo-tema');
    if (t) document.querySelector(`[data-theme-set="${t}"]`)?.click();
  } catch {}
})();
