const PDFDocument = require('pdfkit');
const path = require('path');

function crearPDF(ot) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48, bufferPages: true });
    const partes = [];

    doc.on('data', (parte) => partes.push(parte));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(partes)));

    const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const nombreInstitucion = process.env.INSTITUTION_NAME || 'Institución Educativa';
    const azul = '#12304a';
    const verde = '#17856b';

    function asegurarEspacio(alto) {
      if (doc.y + alto > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
    }

    function encabezadoSeccion(titulo) {
      asegurarEspacio(34);
      doc.moveDown(0.45);
      doc.rect(doc.page.margins.left, doc.y, ancho, 21).fill('#eaf1f5');
      doc.fillColor(azul).font('Helvetica-Bold').fontSize(10)
        .text(titulo.toUpperCase(), doc.page.margins.left + 8, doc.y + 5);
      doc.y += 27;
    }

    function campo(etiqueta, valor) {
      const texto = valor === undefined || valor === null || valor === '' ? '—' : String(valor);
      doc.font('Helvetica').fontSize(9);
      const altoValor = doc.heightOfString(texto, { width: ancho - 105, lineGap: 2 });
      asegurarEspacio(Math.max(17, altoValor) + 8);
      const y = doc.y;
      doc.fillColor('#526273').font('Helvetica-Bold').fontSize(9)
        .text(`${etiqueta}:`, doc.page.margins.left, y, { width: 98 });
      doc.fillColor('#1e2933').font('Helvetica').fontSize(9)
        .text(texto, doc.page.margins.left + 105, y, { width: ancho - 105, lineGap: 2 });
      doc.y = Math.max(y + 15, doc.y) + 5;
    }

    function fecha(valor) {
      if (!valor) return '—';
      const dato = new Date(valor);
      return Number.isNaN(dato.getTime()) ? '—' : dato.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
    }

    doc.rect(doc.page.margins.left, 42, 48, 48).fill(azul);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15)
      .text('OT', doc.page.margins.left, 58, { width: 48, align: 'center' });
    doc.fillColor(azul).font('Helvetica-Bold').fontSize(14)
      .text(nombreInstitucion, doc.page.margins.left + 60, 45, { width: ancho - 60 });
    doc.fillColor('#526273').font('Helvetica').fontSize(9)
      .text('MANTENIMIENTO · ORDEN DE TRABAJO', doc.page.margins.left + 60, 67);

    doc.moveTo(doc.page.margins.left, 101).lineTo(doc.page.width - doc.page.margins.right, 101)
      .lineWidth(1.5).stroke(verde);
    doc.y = 116;
    doc.fillColor(azul).font('Helvetica-Bold').fontSize(18).text('ORDEN DE TRABAJO', { align: 'center' });
    doc.moveDown(0.25);
    doc.fillColor(verde).font('Helvetica-Bold').fontSize(13).text(ot.numero, { align: 'center' });
    doc.moveDown(0.5);

    encabezadoSeccion('Datos de la solicitud');
    campo('Técnico', ot.tecnico);
    campo('Área / Lugar', ot.area);
    campo('Solicitado por', ot.solicitadoPor);
    campo('Fecha de registro', fecha(ot.createdAt));
    campo('Tipo / Prioridad', `${ot.tipo} / ${ot.prioridad}`);
    campo('Categoría', ot.categoria);
    campo('Descripción', ot.descripcion);

    encabezadoSeccion('Ejecución del trabajo');
    campo('EPP usado', Array.isArray(ot.eppUsado) && ot.eppUsado.length ? ot.eppUsado.join(', ') : 'No especificado');
    campo('Trabajo realizado', ot.trabajoRealizado);
    campo('Materiales usados', ot.materialesUsados);
    campo('Hora de inicio', fecha(ot.horaInicio));
    campo('Hora de fin', fecha(ot.horaFin));
    campo('¿Quedó listo?', ot.quedoListo ? 'Sí' : 'No');
    campo('Observaciones', ot.observaciones);

    encabezadoSeccion('Conformidad');
    campo('Correo del solicitante', ot.emailSolicitante);
    asegurarEspacio(90);
    doc.fillColor('#526273').font('Helvetica-Bold').fontSize(9)
      .text('Firma del solicitante:', doc.page.margins.left, doc.y);
    const yFirma = doc.y + 15;
    if (ot.firmaSolicitante) {
      const coincidencia = ot.firmaSolicitante.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
      if (coincidencia) {
        doc.image(Buffer.from(coincidencia[1], 'base64'), doc.page.margins.left, yFirma, {
          fit: [210, 58]
        });
      } else {
        doc.fillColor('#526273').font('Helvetica').fontSize(9)
          .text('Firma registrada digitalmente.', doc.page.margins.left, yFirma + 8);
      }
    } else {
      doc.moveTo(doc.page.margins.left, yFirma + 45)
        .lineTo(doc.page.margins.left + 220, yFirma + 45)
        .lineWidth(0.7).stroke('#9aa8b3');
    }

    if (Array.isArray(ot.evidencias) && ot.evidencias.length) {
      encabezadoSeccion('Evidencias fotográficas');
      const separacion = 16;
      const anchoColumna = (ancho - separacion) / 2;
      const altoFila = 150;

      for (let inicio = 0; inicio < ot.evidencias.length; inicio += 2) {
        asegurarEspacio(altoFila);
        const yFila = doc.y;
        const evidenciasFila = ot.evidencias.slice(inicio, inicio + 2);

        evidenciasFila.forEach((evidencia, indice) => {
          const x = doc.page.margins.left + indice * (anchoColumna + separacion);
          const filename = path.basename(evidencia.filename || '');
          const extension = path.extname(filename).toLowerCase();

          if (extension === '.jpg' || extension === '.jpeg' || extension === '.png') {
            const archivo = path.join(__dirname, '..', 'public', 'uploads', String(ot._id), filename);
            doc.image(archivo, x, yFila, {
              fit: [anchoColumna, 112],
              align: 'center',
              valign: 'center'
            });
          } else {
            doc.rect(x, yFila, anchoColumna, 112).fill('#f3f6f8');
            doc.fillColor('#526273').font('Helvetica').fontSize(9)
              .text(`Vista previa no disponible (${extension.slice(1).toUpperCase() || 'archivo'})`, x + 6, yFila + 40, {
                width: anchoColumna - 12,
                align: 'center'
              });
            doc.fillColor('#71808d').font('Helvetica').fontSize(8)
              .text(filename, x + 6, yFila + 61, { width: anchoColumna - 12, align: 'center' });
          }

          doc.fillColor('#526273').font('Helvetica').fontSize(8)
            .text(fecha(evidencia.fecha), x, yFila + 118, { width: anchoColumna });
        });

        doc.y = yFila + altoFila;
      }
    }

    const rango = doc.bufferedPageRange();
    for (let pagina = rango.start; pagina < rango.start + rango.count; pagina += 1) {
      doc.switchToPage(pagina);
      const pieY = doc.page.height - 32;
      doc.moveTo(doc.page.margins.left, pieY - 8)
        .lineTo(doc.page.width - doc.page.margins.right, pieY - 8)
        .lineWidth(0.5).stroke('#d4dde3');
      doc.fillColor('#71808d').font('Helvetica').fontSize(8)
        .text(`${nombreInstitucion} · ${ot.numero}`, doc.page.margins.left, pieY, {
          width: ancho - 50,
          lineBreak: false
        });
      doc.text(`Página ${pagina + 1} de ${rango.count}`, doc.page.width - doc.page.margins.right - 50, pieY, {
        width: 50,
        align: 'right',
        lineBreak: false
      });
    }

    doc.end();
  });
}

module.exports = { crearPDF };
