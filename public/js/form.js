const form = document.querySelector('#ot-form');
const canvas = document.querySelector('#signature-pad');
const ctx = canvas.getContext('2d');
const mensaje = document.querySelector('#form-message');
const botonEnviar = document.querySelector('#submit-button');
const evidenciasInput = document.querySelector('#evidencias-input');
const evidenciasDropZone = document.querySelector('#evidencias-drop-zone');
const evidenciasSelect = document.querySelector('#evidencias-select');
const evidenciasPreview = document.querySelector('#evidencias-preview');
const evidenciasCount = document.querySelector('#evidencias-count');
const evidenciasError = document.querySelector('#evidencias-error');
const evidencias = [];
const tiposEvidencia = new Set(['image/jpeg', 'image/png', 'image/heic']);
const maximoEvidencias = 5;
const maximoTamanoEvidencia = 5 * 1024 * 1024;
let dibujando = false;
let tieneFirma = false;

function ajustarCanvas() {
  const escala = window.devicePixelRatio || 1;
  const rectangulo = canvas.getBoundingClientRect();
  const firmaAnterior = tieneFirma ? canvas.toDataURL('image/png') : '';
  canvas.width = Math.round(rectangulo.width * escala);
  canvas.height = Math.round(rectangulo.height * escala);
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#12304a';
  if (firmaAnterior) {
    const imagen = new Image();
    imagen.onload = () => ctx.drawImage(imagen, 0, 0, rectangulo.width, rectangulo.height);
    imagen.src = firmaAnterior;
  }
}

// Convierte la coordenada de pantalla a la coordenada interna del lienzo.
function obtenerPunto(evento) {
  const rectangulo = canvas.getBoundingClientRect();
  const punto = evento.touches ? evento.touches[0] : evento;
  return { x: punto.clientX - rectangulo.left, y: punto.clientY - rectangulo.top };
}

function iniciarTrazo(evento) {
  evento.preventDefault();
  dibujando = true;
  const punto = obtenerPunto(evento);
  ctx.beginPath();
  ctx.moveTo(punto.x, punto.y);
}

function continuarTrazo(evento) {
  if (!dibujando) return;
  evento.preventDefault();
  const punto = obtenerPunto(evento);
  ctx.lineTo(punto.x, punto.y);
  ctx.stroke();
  tieneFirma = true;
}

function terminarTrazo() {
  dibujando = false;
}

function mostrarMensaje(texto, tipo = '') {
  mensaje.textContent = texto;
  mensaje.className = `notice${tipo ? ` notice-${tipo}` : ''}`;
  mensaje.hidden = false;
}

function convertirFecha(valor) {
  return valor ? new Date(valor).toISOString() : null;
}

function mostrarErrorEvidencias(errores) {
  evidenciasError.textContent = errores.join(' ');
  evidenciasError.hidden = errores.length === 0;
}

function renderizarEvidencias() {
  evidenciasPreview.replaceChildren();
  evidenciasCount.textContent = `${evidencias.length} / ${maximoEvidencias} fotos`;

  evidencias.forEach(({ archivo, url }, indice) => {
    const elemento = document.createElement('div');
    elemento.className = 'evidence-item';

    const imagen = document.createElement('img');
    imagen.src = url;
    imagen.alt = `Vista previa de ${archivo.name}`;
    elemento.append(imagen);

    const nombre = document.createElement('p');
    nombre.className = 'evidence-name';
    nombre.textContent = archivo.name;
    elemento.append(nombre);

    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'evidence-remove';
    quitar.textContent = '×';
    quitar.setAttribute('aria-label', `Quitar ${archivo.name}`);
    quitar.addEventListener('click', () => {
      URL.revokeObjectURL(evidencias[indice].url);
      evidencias.splice(indice, 1);
      renderizarEvidencias();
    });
    elemento.append(quitar);
    evidenciasPreview.append(elemento);
  });
}

function agregarEvidencias(archivos) {
  const errores = [];

  for (const archivo of archivos) {
    if (!tiposEvidencia.has(archivo.type)) {
      errores.push(`${archivo.name}: tipo no permitido. Usa JPG, PNG o HEIC.`);
      continue;
    }
    if (archivo.size > maximoTamanoEvidencia) {
      errores.push(`${archivo.name}: supera el máximo de 5 MB.`);
      continue;
    }
    if (evidencias.length >= maximoEvidencias) {
      errores.push('Solo puedes subir hasta 5 fotos.');
      continue;
    }
    evidencias.push({ archivo, url: URL.createObjectURL(archivo) });
  }

  mostrarErrorEvidencias(errores);
  renderizarEvidencias();
}

function limpiarEvidencias() {
  evidencias.forEach(({ url }) => URL.revokeObjectURL(url));
  evidencias.length = 0;
  evidenciasInput.value = '';
  mostrarErrorEvidencias([]);
  renderizarEvidencias();
}

canvas.addEventListener('pointerdown', iniciarTrazo);
canvas.addEventListener('pointermove', continuarTrazo);
canvas.addEventListener('pointerup', terminarTrazo);
canvas.addEventListener('pointerleave', terminarTrazo);
window.addEventListener('resize', ajustarCanvas);

document.querySelector('#clear-signature').addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  tieneFirma = false;
});

evidenciasSelect.addEventListener('click', () => evidenciasInput.click());
evidenciasInput.addEventListener('change', () => {
  agregarEvidencias(evidenciasInput.files);
  evidenciasInput.value = '';
});

evidenciasDropZone.addEventListener('dragover', (evento) => {
  evento.preventDefault();
  evidenciasDropZone.classList.add('drag-over');
});
evidenciasDropZone.addEventListener('dragleave', (evento) => {
  if (!evidenciasDropZone.contains(evento.relatedTarget)) {
    evidenciasDropZone.classList.remove('drag-over');
  }
});
evidenciasDropZone.addEventListener('drop', (evento) => {
  evento.preventDefault();
  evidenciasDropZone.classList.remove('drag-over');
  agregarEvidencias(evento.dataTransfer.files);
});

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!form.reportValidity()) return;

  const datos = new FormData(form);
  datos.delete('evidencias');
  datos.set('horaInicio', convertirFecha(datos.get('horaInicio')) || '');
  datos.set('horaFin', convertirFecha(datos.get('horaFin')) || '');
  datos.set('quedoListo', datos.get('quedoListo') === 'true' ? 'true' : 'false');
  datos.set('firmaSolicitante', tieneFirma ? canvas.toDataURL('image/png') : '');
  evidencias.forEach(({ archivo }) => datos.append('evidencias', archivo));

  botonEnviar.disabled = true;
  botonEnviar.textContent = 'Enviando…';
  mensaje.hidden = true;

  try {
    const respuesta = await fetch('/api/ot', {
      method: 'POST',
      body: datos
    });
    const resultado = await respuesta.json();
    if (!respuesta.ok) {
      const detalle = resultado.errores?.map((error) => error.mensaje).join(' ');
      throw new Error(detalle || resultado.mensaje || 'No se pudo registrar la orden.');
    }

    const avisoCorreo = resultado.correo?.enviado
      ? ` ${resultado.correo.mensaje}`
      : ` ${resultado.correo?.mensaje || 'El correo no fue enviado.'}`;
    mostrarMensaje(`Orden ${resultado.ot.numero} registrada correctamente.${avisoCorreo}`, resultado.correo?.enviado ? '' : 'warning');
    form.reset();
    limpiarEvidencias();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    tieneFirma = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    mostrarMensaje(error.message, 'error');
  } finally {
    botonEnviar.disabled = false;
    botonEnviar.textContent = 'Enviar orden de trabajo';
  }
});

ajustarCanvas();
