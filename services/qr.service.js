const QRCode = require('qrcode');

async function generarQR(urlFormulario) {
  if (!urlFormulario) {
    throw new Error('Falta configurar PUBLIC_FORM_URL para generar el código QR.');
  }

  return QRCode.toDataURL(urlFormulario, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 600,
    color: { dark: '#12304a', light: '#ffffff' }
  });
}

module.exports = { generarQR };
