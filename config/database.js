const mongoose = require('mongoose');

async function conectarBaseDatos() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('Falta configurar MONGODB_URI en las variables de entorno.');
  }

  await mongoose.connect(uri);
  console.log('Conexión a MongoDB establecida.');
}

module.exports = conectarBaseDatos;
