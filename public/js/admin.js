const API = '/api/ot';
const TOKEN_KEY = 'otm-admin-token';
const estado = { pagina: 1, paginas: 1, token: sessionStorage.getItem(TOKEN_KEY) || '' };
const loginPanel = document.querySelector('#login-panel');
const dashboard = document.querySelector('#dashboard-content');
const loginMessage = document.querySelector('#login-message');
const adminMessage = document.querySelector('#admin-message');
const cuerpoTabla = document.querySelector('#orders-table');
const tokenInput = document.querySelector('#admin-token');

function encabezadosAdmin(extra = {}) {
  return { 'x-admin-token': estado.token, ...extra };
}

async function solicitar(url, opciones = {}) {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: encabezadosAdmin(opciones.headers || {})
  });
  if (respuesta.status === 401) {
    cerrarSesion();
    throw new Error('La sesión administrativa expiró o el token no es válido.');
  }
  if (!respuesta.ok) {
    const resultado = await respuesta.json().catch(() => ({}));
    throw new Error(resultado.mensaje || `Error del servidor (${respuesta.status}).`);
  }
  return respuesta;
}

// Construye los nodos con textContent para no interpretar datos de la base como HTML.
function mostrarAviso(elemento, texto, tipo = '') {
  elemento.textContent = texto;
  elemento.className = `notice${tipo ? ` notice-${tipo}` : ''}`;
  elemento.hidden = false;
}

function cerrarSesion() {
  sessionStorage.removeItem(TOKEN_KEY);
  estado.token = '';
  loginPanel.hidden = false;
  dashboard.hidden = true;
  document.querySelector('#logout-button').hidden = true;
}

function fechaLocal(valor) {
  return valor ? new Date(valor).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

function crearCelda(texto, clase = '') {
  const celda = document.createElement('td');
  celda.textContent = texto ?? '—';
  if (clase) celda.className = clase;
  return celda;
}

function crearAccion(texto, callback, clase = '') {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = `text-button${clase ? ` ${clase}` : ''}`;
  boton.textContent = texto;
  boton.addEventListener('click', callback);
  return boton;
}

async function descargarPDF(id, numero) {
  const respuesta = await solicitar(`${API}/${encodeURIComponent(id)}/pdf`);
  const archivo = await respuesta.blob();
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(archivo);
  enlace.download = `${numero}.pdf`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

async function mostrarDetalle(id) {
  const dialogo = document.querySelector('#detail-dialog');
  const contenedor = document.querySelector('#detail-content');
  const respuesta = await solicitar(`${API}/${encodeURIComponent(id)}`);
  const ot = await respuesta.json();
  document.querySelector('#detail-title').textContent = `Orden ${ot.numero}`;
  contenedor.replaceChildren();

  const campos = [
    ['Técnico', ot.tecnico], ['Área / Lugar', ot.area], ['Solicitado por', ot.solicitadoPor],
    ['Fecha de registro', new Date(ot.createdAt).toLocaleString('es')], ['Tipo', ot.tipo],
    ['Prioridad', ot.prioridad], ['Categoría', ot.categoria], ['Descripción', ot.descripcion, true],
    ['EPP usado', ot.eppUsado?.join(', ') || 'No especificado'], ['Trabajo realizado', ot.trabajoRealizado, true],
    ['Materiales usados', ot.materialesUsados, true], ['Hora de inicio', ot.horaInicio ? new Date(ot.horaInicio).toLocaleString('es') : '—'],
    ['Hora de fin', ot.horaFin ? new Date(ot.horaFin).toLocaleString('es') : '—'],
    ['¿Quedó listo?', ot.quedoListo ? 'Sí' : 'No'], ['Observaciones', ot.observaciones, true],
    ['Correo del solicitante', ot.emailSolicitante]
  ];

  const grilla = document.createElement('div');
  grilla.className = 'detail-grid';
  for (const [etiqueta, valor, anchoCompleto] of campos) {
    const elemento = document.createElement('div');
    elemento.className = `detail-item${anchoCompleto ? ' full' : ''}`;
    const nombre = document.createElement('span');
    nombre.textContent = etiqueta;
    const contenido = document.createElement('strong');
    contenido.textContent = valor || '—';
    elemento.append(nombre, contenido);
    grilla.append(elemento);
  }
  if (ot.firmaSolicitante) {
    const elemento = document.createElement('div');
    elemento.className = 'detail-item full';
    const nombre = document.createElement('span');
    nombre.textContent = 'Firma del solicitante';
    const imagen = document.createElement('img');
    imagen.className = 'detail-signature';
    imagen.src = ot.firmaSolicitante;
    imagen.alt = 'Firma del solicitante';
    elemento.append(nombre, imagen);
    grilla.append(elemento);
  }
  contenedor.append(grilla);
  dialogo.showModal();
}

async function cargarOrdenes() {
  const parametros = new URLSearchParams();
  const formulario = new FormData(document.querySelector('#filter-form'));
  for (const [clave, valor] of formulario.entries()) {
    if (valor) parametros.set(clave, valor);
  }
  parametros.set('pagina', String(estado.pagina));
  parametros.set('limite', '50');

  const respuesta = await solicitar(`${API}?${parametros.toString()}`);
  const resultado = await respuesta.json();
  estado.paginas = Math.max(1, resultado.paginas);
  document.querySelector('#page-label').textContent = `Página ${estado.pagina} de ${estado.paginas}`;
  document.querySelector('#previous-page').disabled = estado.pagina <= 1;
  document.querySelector('#next-page').disabled = estado.pagina >= estado.paginas;
  cuerpoTabla.replaceChildren();

  if (!resultado.ordenes.length) {
    const fila = document.createElement('tr');
    const celda = crearCelda('No hay órdenes que coincidan con los filtros.');
    celda.colSpan = 8;
    celda.className = 'empty-cell';
    fila.append(celda);
    cuerpoTabla.append(fila);
    return;
  }

  for (const ot of resultado.ordenes) {
    const fila = document.createElement('tr');
    fila.append(crearCelda(ot.numero, 'order-number'), crearCelda(fechaLocal(ot.createdAt)),
      crearCelda(ot.area), crearCelda(ot.tecnico), crearCelda(ot.tipo), crearCelda(ot.prioridad));
    const estadoCelda = document.createElement('td');
    const insignia = document.createElement('span');
    insignia.className = `status-pill${ot.quedoListo ? ' done' : ''}`;
    insignia.textContent = ot.quedoListo ? 'Lista' : 'Pendiente';
    estadoCelda.append(insignia);
    fila.append(estadoCelda);

    const acciones = document.createElement('td');
    const grupo = document.createElement('div');
    grupo.className = 'row-actions';
    grupo.append(
      crearAccion('Ver', () => mostrarDetalle(ot._id).catch((error) => mostrarAviso(adminMessage, error.message, 'error'))),
      crearAccion('PDF', () => descargarPDF(ot._id, ot.numero).catch((error) => mostrarAviso(adminMessage, error.message, 'error'))),
      crearAccion('Eliminar', () => eliminarOrden(ot._id, ot.numero).catch((error) => mostrarAviso(adminMessage, error.message, 'error')), 'danger')
    );
    acciones.append(grupo);
    fila.append(acciones);
    cuerpoTabla.append(fila);
  }
}

async function eliminarOrden(id, numero) {
  if (!window.confirm(`¿Eliminar la orden ${numero}? Esta acción no se puede deshacer.`)) return;
  const respuesta = await solicitar(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const resultado = await respuesta.json();
  mostrarAviso(adminMessage, resultado.mensaje);
  await cargarTodo();
}

function dibujarBarras(contenedor, datos, etiquetaVacia) {
  contenedor.replaceChildren();
  if (!datos.length) {
    const vacio = document.createElement('p');
    vacio.className = 'field-hint';
    vacio.textContent = etiquetaVacia;
    contenedor.append(vacio);
    return;
  }
  const maximo = Math.max(...datos.map((dato) => dato.cantidad), 1);
  for (const dato of datos) {
    const fila = document.createElement('div');
    fila.className = 'chart-row';
    const etiqueta = document.createElement('span');
    etiqueta.className = 'chart-label';
    etiqueta.textContent = dato._id || 'Sin dato';
    const pista = document.createElement('div');
    pista.className = 'chart-track';
    const barra = document.createElement('div');
    barra.className = 'chart-bar';
    barra.style.width = `${Math.max(4, (dato.cantidad / maximo) * 100)}%`;
    pista.append(barra);
    const cantidad = document.createElement('span');
    cantidad.className = 'chart-count';
    cantidad.textContent = String(dato.cantidad);
    fila.append(etiqueta, pista, cantidad);
    contenedor.append(fila);
  }
}

async function cargarEstadisticas() {
  const respuesta = await solicitar(`${API}/estadisticas`);
  const datos = await respuesta.json();
  document.querySelector('#stat-total').textContent = datos.total;
  document.querySelector('#stat-pending').textContent = datos.pendientes;
  dibujarBarras(document.querySelector('#chart-month'), datos.porMes, 'Todavía no hay registros.');
  dibujarBarras(document.querySelector('#chart-area'), datos.porArea, 'Todavía no hay registros.');
  dibujarBarras(document.querySelector('#chart-technician'), datos.porTecnico, 'Todavía no hay registros.');
}

async function cargarQR() {
  const respuesta = await fetch(`${API}/qr`);
  if (!respuesta.ok) throw new Error('No se pudo generar el QR del formulario.');
  const datos = await respuesta.json();
  const imagen = document.querySelector('#qr-image');
  imagen.src = datos.dataUrl;
  imagen.hidden = false;
  const enlace = document.querySelector('#form-url');
  enlace.href = datos.url;
  enlace.textContent = datos.url;
}

async function cargarTodo() {
  adminMessage.hidden = true;
  try {
    await Promise.all([cargarEstadisticas(), cargarOrdenes(), cargarQR()]);
  } catch (error) {
    mostrarAviso(adminMessage, error.message, 'error');
  }
}

document.querySelector('#login-form').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  estado.token = tokenInput.value.trim();
  loginMessage.hidden = true;
  try {
    const respuesta = await solicitar(`${API}?limite=1`);
    await respuesta.json();
    sessionStorage.setItem(TOKEN_KEY, estado.token);
    loginPanel.hidden = true;
    dashboard.hidden = false;
    document.querySelector('#logout-button').hidden = false;
    await cargarTodo();
  } catch (error) {
    mostrarAviso(loginMessage, error.message, 'error');
  }
});

document.querySelector('#logout-button').addEventListener('click', cerrarSesion);
document.querySelector('#filter-form').addEventListener('submit', (evento) => {
  evento.preventDefault();
  estado.pagina = 1;
  cargarOrdenes().catch((error) => mostrarAviso(adminMessage, error.message, 'error'));
});
document.querySelector('#clear-filters').addEventListener('click', () => {
  document.querySelector('#filter-form').reset();
  estado.pagina = 1;
  cargarOrdenes().catch((error) => mostrarAviso(adminMessage, error.message, 'error'));
});
document.querySelector('#refresh-button').addEventListener('click', cargarTodo);
document.querySelector('#previous-page').addEventListener('click', () => {
  estado.pagina = Math.max(1, estado.pagina - 1);
  cargarOrdenes().catch((error) => mostrarAviso(adminMessage, error.message, 'error'));
});
document.querySelector('#next-page').addEventListener('click', () => {
  estado.pagina = Math.min(estado.paginas, estado.pagina + 1);
  cargarOrdenes().catch((error) => mostrarAviso(adminMessage, error.message, 'error'));
});
document.querySelector('#close-dialog').addEventListener('click', () => document.querySelector('#detail-dialog').close());
document.querySelector('#detail-dialog').addEventListener('click', (evento) => {
  if (evento.target === evento.currentTarget) evento.currentTarget.close();
});

if (estado.token) {
  tokenInput.value = estado.token;
  document.querySelector('#login-form').requestSubmit();
}
