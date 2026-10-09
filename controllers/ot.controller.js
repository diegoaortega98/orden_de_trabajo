const mongoose = require('mongoose');
const fs = require('fs/promises');
const path = require('path');
const OT = require('../models/OT');
const Counter = require('../models/Counter');
const { crearPDF } = require('../services/pdf.service');
const { enviarOTPorCorreo } = require('../services/email.service');
const { generarQR } = require('../services/qr.service');

const extensionesEvidencia = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/heic', '.heic']
]);

const camposEditables = new Set([
  'tecnico', 'area', 'solicitadoPor', 'tipo', 'prioridad', 'categoria', 'descripcion',
  'eppUsado', 'trabajoRealizado', 'materialesUsados', 'horaInicio', 'horaFin',
  'quedoListo', 'observaciones', 'firmaSolicitante', 'emailSolicitante'
]);

function escaparRegex(valor) {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function siguienteNumero() {
  // La actualización atómica evita repetir el consecutivo con solicitudes simultáneas.
  const anio = new Date().getFullYear();
  const contador = await Counter.findOneAndUpdate(
    { _id: `ot-${anio}` },
    { $inc: { secuencia: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return `OT-${anio}-${String(contador.secuencia).padStart(3, '0')}`;
}

function validarId(id) {
  return mongoose.isValidObjectId(id);
}

async function crearOT(req, res) {
  let directorioEvidencias;
  let idOT;
  let otCreada = false;
  let archivos = [];
  try {
    archivos = Array.isArray(req.files) ? req.files : [];
    const archivosInvalidos = archivos.filter((archivo) =>
      !extensionesEvidencia.has(archivo.mimetype) || archivo.size > 5 * 1024 * 1024
    );
    if (archivosInvalidos.length) {
      for (const archivo of archivos) {
        await fs.rm(archivo.path, { force: true });
      }
      return res.status(400).json({ mensaje: 'Las evidencias deben ser JPG, PNG o HEIC y pesar 5 MB o menos.' });
    }

    const numero = await siguienteNumero();
    idOT = new mongoose.Types.ObjectId();
    const ot = await OT.create({ ...req.body, _id: idOT, numero, evidencias: [] });
    otCreada = true;

    if (archivos.length) {
      directorioEvidencias = path.join(__dirname, '..', 'public', 'uploads', idOT.toString());
      await fs.mkdir(directorioEvidencias, { recursive: true });
      const evidencias = [];

      for (const archivo of archivos) {
        const filename = path.basename(archivo.filename);
        await fs.rename(archivo.path, path.join(directorioEvidencias, filename));
        evidencias.push({
          filename,
          url: `/uploads/${idOT}/${filename}`,
          mimetype: archivo.mimetype,
          size: archivo.size,
          fecha: new Date(),
          tipo: 'reporte'
        });
      }

      ot.evidencias = evidencias;
      await ot.save();
    }

    let correo;

    try {
      const pdf = await crearPDF(ot);
      correo = await enviarOTPorCorreo(ot, pdf, req.body.emailSolicitante);
      if (!correo.enviado) console.warn(correo.mensaje);
    } catch (errorCorreo) {
      console.error(`La OT ${numero} se guardó, pero falló el envío del correo:`, errorCorreo);
      correo = {
        enviado: false,
        mensaje: 'La OT se guardó, pero no se pudo generar o enviar el PDF por correo. Revisa los registros del servidor.'
      };
    }

    return res.status(201).json({ mensaje: 'Orden de trabajo creada.', ot, correo });
  } catch (error) {
    for (const archivo of archivos) {
      try {
        await fs.rm(archivo.path, { force: true });
      } catch (errorLimpieza) {
        console.error('No se pudo limpiar una evidencia temporal:', errorLimpieza);
      }
    }
    if (directorioEvidencias) {
      try {
        await fs.rm(directorioEvidencias, { recursive: true, force: true });
      } catch (errorLimpieza) {
        console.error('No se pudieron limpiar evidencias después de fallar la creación de la OT:', errorLimpieza);
      }
    }
    if (otCreada) {
      try {
        await OT.deleteOne({ _id: idOT });
      } catch (errorLimpieza) {
        console.error('No se pudo eliminar la OT incompleta:', errorLimpieza);
      }
    }
    console.error('Error al crear la OT:', error);
    return res.status(500).json({ mensaje: 'No se pudo crear la orden de trabajo.' });
  }
}

async function listarOT(req, res) {
  try {
    const filtro = {};
    if (req.query.area) filtro.area = new RegExp(escaparRegex(String(req.query.area)), 'i');
    if (req.query.tecnico) filtro.tecnico = new RegExp(escaparRegex(String(req.query.tecnico)), 'i');
    if (req.query.estado === 'lista') filtro.quedoListo = true;
    if (req.query.estado === 'pendiente') filtro.quedoListo = false;

    const fecha = {};
    if (req.query.desde) fecha.$gte = new Date(`${req.query.desde}T00:00:00.000Z`);
    if (req.query.hasta) fecha.$lte = new Date(`${req.query.hasta}T23:59:59.999Z`);
    if (Object.values(fecha).some((valor) => Number.isNaN(valor.getTime()))) {
      return res.status(400).json({ mensaje: 'El filtro de fechas no es válido.' });
    }
    if (Object.keys(fecha).length) filtro.createdAt = fecha;

    const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
    const limite = Math.min(200, Math.max(1, Number.parseInt(req.query.limite, 10) || 100));
    const [ordenes, total] = await Promise.all([
      OT.find(filtro).sort({ createdAt: -1 }).skip((pagina - 1) * limite).limit(limite).lean(),
      OT.countDocuments(filtro)
    ]);

    return res.json({ ordenes, total, pagina, paginas: Math.ceil(total / limite) });
  } catch (error) {
    console.error('Error al listar las OT:', error);
    return res.status(500).json({ mensaje: 'No se pudieron listar las órdenes de trabajo.' });
  }
}

async function obtenerOT(req, res) {
  try {
    if (!validarId(req.params.id)) return res.status(400).json({ mensaje: 'Identificador de OT inválido.' });
    const ot = await OT.findById(req.params.id).lean();
    if (!ot) return res.status(404).json({ mensaje: 'Orden de trabajo no encontrada.' });
    return res.json(ot);
  } catch (error) {
    console.error('Error al consultar la OT:', error);
    return res.status(500).json({ mensaje: 'No se pudo consultar la orden de trabajo.' });
  }
}

async function actualizarOT(req, res) {
  try {
    if (!validarId(req.params.id)) return res.status(400).json({ mensaje: 'Identificador de OT inválido.' });
    const cambios = Object.fromEntries(
      Object.entries(req.body).filter(([campo]) => camposEditables.has(campo))
    );
    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ mensaje: 'No se recibieron campos editables.' });
    }
    const actual = await OT.findById(req.params.id);
    if (!actual) return res.status(404).json({ mensaje: 'Orden de trabajo no encontrada.' });

    const horaInicio = cambios.horaInicio ?? actual.horaInicio;
    const horaFin = cambios.horaFin ?? actual.horaFin;
    if (horaInicio && horaFin && new Date(horaFin) < new Date(horaInicio)) {
      return res.status(400).json({ mensaje: 'La hora de fin no puede ser anterior a la hora de inicio.' });
    }

    const ot = await OT.findByIdAndUpdate(req.params.id, cambios, {
      new: true,
      runValidators: true
    });
    if (!ot) return res.status(404).json({ mensaje: 'Orden de trabajo no encontrada.' });
    return res.json({ mensaje: 'Orden de trabajo actualizada.', ot });
  } catch (error) {
    console.error('Error al actualizar la OT:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ mensaje: 'Los datos no cumplen las validaciones.', errores: error.message });
    }
    return res.status(500).json({ mensaje: 'No se pudo actualizar la orden de trabajo.' });
  }
}

async function eliminarOT(req, res) {
  try {
    if (!validarId(req.params.id)) return res.status(400).json({ mensaje: 'Identificador de OT inválido.' });
    const ot = await OT.findByIdAndDelete(req.params.id);
    if (!ot) return res.status(404).json({ mensaje: 'Orden de trabajo no encontrada.' });
    return res.json({ mensaje: `Orden ${ot.numero} eliminada.` });
  } catch (error) {
    console.error('Error al eliminar la OT:', error);
    return res.status(500).json({ mensaje: 'No se pudo eliminar la orden de trabajo.' });
  }
}

async function descargarPDF(req, res) {
  try {
    if (!validarId(req.params.id)) return res.status(400).json({ mensaje: 'Identificador de OT inválido.' });
    const ot = await OT.findById(req.params.id).lean();
    if (!ot) return res.status(404).json({ mensaje: 'Orden de trabajo no encontrada.' });
    const pdf = await crearPDF(ot);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${ot.numero}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    console.error('Error al generar el PDF:', error);
    return res.status(500).json({ mensaje: 'No se pudo generar el PDF.' });
  }
}

async function obtenerQR(req, res) {
  try {
    const url = process.env.PUBLIC_FORM_URL;
    const dataUrl = await generarQR(url);
    return res.json({ url, dataUrl });
  } catch (error) {
    console.error('Error al generar el QR:', error);
    return res.status(500).json({ mensaje: error.message });
  }
}

async function obtenerEstadisticas(req, res) {
  try {
    const [porMes, porArea, porTecnico, total, pendientes] = await Promise.all([
      OT.aggregate([
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, cantidad: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $limit: 24 }
      ]),
      OT.aggregate([
        { $group: { _id: '$area', cantidad: { $sum: 1 } } },
        { $sort: { cantidad: -1 } },
        { $limit: 10 }
      ]),
      OT.aggregate([
        { $group: { _id: '$tecnico', cantidad: { $sum: 1 } } },
        { $sort: { cantidad: -1 } },
        { $limit: 10 }
      ]),
      OT.countDocuments(),
      OT.countDocuments({ quedoListo: false })
    ]);

    return res.json({ total, pendientes, porMes, porArea, porTecnico });
  } catch (error) {
    console.error('Error al calcular estadísticas:', error);
    return res.status(500).json({ mensaje: 'No se pudieron cargar las estadísticas.' });
  }
}

module.exports = {
  crearOT,
  listarOT,
  obtenerOT,
  actualizarOT,
  eliminarOT,
  descargarPDF,
  obtenerQR,
  obtenerEstadisticas
};
