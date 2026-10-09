function verificarAdmin(req, res, next) {
  const tokenConfigurado = process.env.ADMIN_TOKEN;
  const tokenRecibido = req.get('x-admin-token');

  if (!tokenConfigurado) {
    return res.status(503).json({
      mensaje: 'El acceso administrativo no está configurado: falta ADMIN_TOKEN.'
    });
  }

  if (!tokenRecibido || tokenRecibido !== tokenConfigurado) {
    return res.status(401).json({ mensaje: 'Token administrativo inválido o ausente.' });
  }

  return next();
}

module.exports = verificarAdmin;
