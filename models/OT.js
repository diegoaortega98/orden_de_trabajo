const mongoose = require('mongoose');

const otSchema = new mongoose.Schema(
  {
    numero: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    tecnico: { type: String, required: true, trim: true, maxlength: 120 },
    area: { type: String, required: true, trim: true, maxlength: 160 },
    solicitadoPor: { type: String, required: true, trim: true, maxlength: 120 },
    tipo: {
      type: String,
      required: true,
      enum: ['Preventivo', 'Correctivo', 'Emergencia']
    },
    prioridad: { type: String, required: true, enum: ['Alta', 'Media', 'Baja'] },
    categoria: {
      type: String,
      required: true,
      enum: ['Eléctrico', 'Plomería', 'Infraestructura', 'Mobiliario', 'Tecnológico']
    },
    descripcion: { type: String, required: true, trim: true, maxlength: 3000 },
    eppUsado: {
      type: [{ type: String, enum: ['Guantes', 'Lentes de seguridad', 'Casco', 'Mascarilla', 'Botas', 'Protección auditiva', 'Otro'] }],
      default: []
    },
    trabajoRealizado: { type: String, trim: true, maxlength: 3000, default: '' },
    materialesUsados: { type: String, trim: true, maxlength: 2000, default: '' },
    horaInicio: { type: Date, default: null },
    horaFin: { type: Date, default: null },
    quedoListo: { type: Boolean, required: true, default: false },
    observaciones: { type: String, trim: true, maxlength: 2000, default: '' },
    firmaSolicitante: { type: String, default: '', maxlength: 1000000 },
    emailSolicitante: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    evidencias: [{
      filename: String,
      url: String,
      mimetype: String,
      size: Number,
      fecha: { type: Date, default: Date.now },
      tipo: { type: String, enum: ['reporte', 'cierre'], default: 'reporte' }
    }]
  },
  { timestamps: true }
);

otSchema.pre('validate', function validarRangoHorario(next) {
  if (this.horaInicio && this.horaFin && this.horaFin < this.horaInicio) {
    this.invalidate('horaFin', 'La hora de fin no puede ser anterior a la hora de inicio.');
  }
  next();
});

otSchema.index({ area: 1, createdAt: -1 });
otSchema.index({ tecnico: 1, createdAt: -1 });

module.exports = mongoose.model('OT', otSchema);
