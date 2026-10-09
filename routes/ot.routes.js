const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const verificarAdmin = require('../middleware/adminAuth');
const controlador = require('../controllers/ot.controller');

const router = express.Router();
const tiposEvidenciaPermitidos = new Set(['image/jpeg', 'image/png', 'image/heic']);
const directorioTemporalEvidencias = path.join(__dirname, '..', 'public', 'uploads', 'temp');
const extensionesPorTipo = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/heic': ['.heic']
};

// Asegura que Multer tenga disponible el directorio temporal.
fs.mkdirSync(directorioTemporalEvidencias, { recursive: true });

const parserEvidencias = multer({
  storage: multer.diskStorage({
    destination(req, file, callback) {
      callback(null, directorioTemporalEvidencias);
    },
    filename(req, file, callback) {
      const extensionOriginal = path.extname(file.originalname).toLowerCase();
      const extensionesValidas = extensionesPorTipo[file.mimetype];
      const extension = extensionesValidas.includes(extensionOriginal)
        ? extensionOriginal
        : extensionesValidas[0];
      const aleatorio = crypto.randomBytes(8).toString('hex');
      callback(null, `${Date.now()}-${aleatorio}${extension}`);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5,
    fieldSize: 2 * 1024 * 1024
  },
  fileFilter(req, file, callback) {
    if (!tiposEvidenciaPermitidos.has(file.mimetype)) {
      return callback(new Error('Tipo de archivo no permitido. Usa JPG, PNG o HEIC.'));
    }
    return callback(null, true);
  }
});

function procesarEvidencias(req, res, next) {
  parserEvidencias.array('evidencias', 5)(req, res, (error) => {
    if (!error) {
      if (req.body.eppUsado && !Array.isArray(req.body.eppUsado)) {
        req.body.eppUsado = [req.body.eppUsado];
      }
      return next();
    }

    if (error instanceof multer.MulterError) {
      const mensaje = error.code === 'LIMIT_FILE_SIZE'
        ? 'Cada evidencia debe pesar 5 MB o menos.'
        : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Puedes subir hasta 5 evidencias.'
          : 'No se pudieron procesar las evidencias.';
      return res.status(400).json({ mensaje });
    }
    return res.status(400).json({ mensaje: error.message || 'No se pudieron procesar las evidencias.' });
  });
}

function revisarValidaciones(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({
      mensaje: 'Revisa los datos enviados.',
      errores: errores.array().map(({ path, msg }) => ({ campo: path, mensaje: msg }))
    });
  }
  return next();
}

const camposTexto = [
  body('tecnico').trim().notEmpty().withMessage('El nombre del técnico es obligatorio.').isLength({ max: 120 }),
  body('area').trim().notEmpty().withMessage('El área o lugar es obligatorio.').isLength({ max: 160 }),
  body('solicitadoPor').trim().notEmpty().withMessage('El solicitante es obligatorio.').isLength({ max: 120 }),
  body('tipo').isIn(['Preventivo', 'Correctivo', 'Emergencia']).withMessage('Tipo de OT inválido.'),
  body('prioridad').isIn(['Alta', 'Media', 'Baja']).withMessage('Prioridad inválida.'),
  body('categoria').isIn(['Eléctrico', 'Plomería', 'Infraestructura', 'Mobiliario', 'Tecnológico']).withMessage('Categoría inválida.'),
  body('descripcion').trim().notEmpty().withMessage('La descripción es obligatoria.').isLength({ max: 3000 }),
  body('eppUsado').optional().isArray({ max: 7 }).withMessage('La lista de EPP no es válida.'),
  body('eppUsado.*').optional().isIn(['Guantes', 'Lentes de seguridad', 'Casco', 'Mascarilla', 'Botas', 'Protección auditiva', 'Otro']),
  body('trabajoRealizado').optional().isString().isLength({ max: 3000 }),
  body('materialesUsados').optional().isString().isLength({ max: 2000 }),
  body('horaInicio').optional({ checkFalsy: true }).isISO8601().withMessage('La hora de inicio debe ser fecha y hora válidas.').toDate(),
  body('horaFin').optional({ checkFalsy: true }).isISO8601().withMessage('La hora de fin debe ser fecha y hora válidas.').toDate(),
  body('quedoListo').isBoolean().withMessage('Indica si el trabajo quedó listo.').toBoolean(),
  body('observaciones').optional().isString().isLength({ max: 2000 }),
  body('firmaSolicitante').optional().isString().isLength({ max: 1000000 }),
  body('emailSolicitante').optional({ checkFalsy: true }).isEmail().withMessage('El correo del solicitante no es válido.').normalizeEmail()
];

const camposActualizables = [
  body('tecnico').optional().trim().notEmpty().isLength({ max: 120 }),
  body('area').optional().trim().notEmpty().isLength({ max: 160 }),
  body('solicitadoPor').optional().trim().notEmpty().isLength({ max: 120 }),
  body('tipo').optional().isIn(['Preventivo', 'Correctivo', 'Emergencia']),
  body('prioridad').optional().isIn(['Alta', 'Media', 'Baja']),
  body('categoria').optional().isIn(['Eléctrico', 'Plomería', 'Infraestructura', 'Mobiliario', 'Tecnológico']),
  body('descripcion').optional().trim().notEmpty().isLength({ max: 3000 }),
  body('eppUsado').optional().isArray({ max: 7 }),
  body('eppUsado.*').optional().isIn(['Guantes', 'Lentes de seguridad', 'Casco', 'Mascarilla', 'Botas', 'Protección auditiva', 'Otro']),
  body('trabajoRealizado').optional().isString().isLength({ max: 3000 }),
  body('materialesUsados').optional().isString().isLength({ max: 2000 }),
  body('horaInicio').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('horaFin').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('quedoListo').optional().isBoolean().toBoolean(),
  body('observaciones').optional().isString().isLength({ max: 2000 }),
  body('firmaSolicitante').optional().isString().isLength({ max: 1000000 }),
  body('emailSolicitante').optional({ checkFalsy: true }).isEmail().normalizeEmail()
];

router.get('/qr', controlador.obtenerQR);
router.post('/', procesarEvidencias, camposTexto, revisarValidaciones, controlador.crearOT);

router.use(verificarAdmin);
router.get('/estadisticas', controlador.obtenerEstadisticas);
router.get('/', controlador.listarOT);
router.get('/:id/pdf', controlador.descargarPDF);
router.get('/:id', controlador.obtenerOT);
router.put('/:id', camposActualizables, revisarValidaciones, controlador.actualizarOT);
router.delete('/:id', controlador.eliminarOT);

module.exports = router;
