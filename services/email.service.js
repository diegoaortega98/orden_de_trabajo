const nodemailer = require('nodemailer');

function smtpConfigurado() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.EMAIL_FROM
  );
}

async function enviarOTPorCorreo(ot, pdfBuffer, destinatario) {
  if (!smtpConfigurado()) {
    return {
      enviado: false,
      mensaje: 'Correo no enviado: configura SMTP_HOST, SMTP_USER, SMTP_PASS y EMAIL_FROM.'
    };
  }

  const para = destinatario || process.env.OT_EMAIL_TO;
  if (!para) {
    return {
      enviado: false,
      mensaje: 'Correo no enviado: no hay destinatario ni OT_EMAIL_TO configurado.'
    };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: para,
    subject: `Orden de Trabajo ${ot.numero}`,
    text: `Se adjunta el PDF de la orden ${ot.numero}, registrada para ${ot.area}.`,
    attachments: [
      {
        filename: `${ot.numero}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  });

  return { enviado: true, mensaje: `PDF enviado a ${para}.` };
}

module.exports = { enviarOTPorCorreo };
