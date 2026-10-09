require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const conectarBaseDatos = require('./config/database');
const rutasOT = require('./routes/ot.routes');

// Elimina evidencias temporales que quedaron abandonadas hace más de una hora.
async function limpiarEvidenciasTemporales() {
  const directorioTemporal = path.join(__dirname, 'public', 'uploads', 'temp');
  await fs.mkdir(directorioTemporal, { recursive: true });
  const archivos = await fs.readdir(directorioTemporal, { withFileTypes: true });
  const ahora = Date.now();

  for (const archivo of archivos) {
    if (!archivo.isFile()) continue;

    const rutaArchivo = path.join(directorioTemporal, archivo.name);
    const informacion = await fs.stat(rutaArchivo);
    if (ahora - informacion.mtimeMs > 60 * 60 * 1000) {
      await fs.rm(rutaArchivo);
    }
  }
}

const app = express();
const puerto = Number(process.env.PORT) || 3000;

const origenes = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origen, callback) {
    if (!origen || origenes.includes(origen)) return callback(null, true);
    return callback(new Error('El origen no está autorizado por la política CORS.'));
  }
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use('/api/ot', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/ot', rutasOT);

app.get('/health', (req, res) => res.json({ estado: 'ok' }));

app.use((req, res) => res.status(404).json({ mensaje: 'Recurso no encontrado.' }));
app.use((error, req, res, next) => {
  console.error('Error no controlado:', error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ mensaje: 'Ocurrió un error interno.' });
});

async function iniciarServidor() {
  try {
    await limpiarEvidenciasTemporales();
    await conectarBaseDatos();
    app.listen(puerto, () => {
      console.log(`Servidor OTM disponible en http://localhost:${puerto}`);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exitCode = 1;
  }
}

iniciarServidor();

module.exports = app;
