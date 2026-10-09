# Sistema OTM para mantenimiento

Aplicación web para registrar Órdenes de Trabajo de Mantenimiento desde un teléfono o un equipo de escritorio. El formulario público puede enlazarse desde un QR; el panel administrativo permite consultar, filtrar, descargar y eliminar órdenes y revisar indicadores.

## Estructura del proyecto

```text
otm-institucion-educativa/
├── config/
│   └── database.js
├── controllers/
│   └── ot.controller.js
├── middleware/
│   └── adminAuth.js
├── models/
│   ├── Counter.js
│   └── OT.js
├── public/
│   ├── admin.html
│   ├── index.html
│   ├── uploads/
│   │   └── .gitkeep
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── admin.js
│       └── form.js
├── routes/
│   └── ot.routes.js
├── services/
│   ├── email.service.js
│   ├── pdf.service.js
│   └── qr.service.js
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js
```

`models/Counter.js` administra el consecutivo anual mediante una actualización atómica para evitar números repetidos cuando llegan solicitudes simultáneas.

## Requisitos

- Node.js 18 o superior y npm.
- Una base de datos MongoDB (Atlas o local).
- Una cuenta de correo con credenciales SMTP, si se desea enviar el PDF automáticamente.

## 1. Instalar dependencias

Abre la carpeta del proyecto en VS Code y, desde la terminal integrada, ejecuta:

```bash
npm install
```

## 2. Configurar MongoDB Atlas

1. Crea una cuenta en [MongoDB Atlas](https://www.mongodb.com/atlas/database) y crea un cluster.
2. En **Database Access**, crea un usuario de base de datos con contraseña. Usa una contraseña distinta a la de tu cuenta de Atlas.
3. En **Network Access**, autoriza las conexiones de tu despliegue. Render utiliza direcciones de salida que pueden cambiar; si Atlas no permite una lista estable para tu servicio, `0.0.0.0/0` habilita conexiones desde cualquier IP y debe combinarse con un usuario de base de datos de mínimo privilegio y una contraseña fuerte.
4. En el cluster, elige **Connect → Drivers**, copia la URI de conexión y reemplaza el usuario, contraseña y nombre de base de datos. Codifica caracteres especiales de usuario/contraseña según corresponda.
5. Conserva la URI como secreto; no la guardes en Git ni en archivos públicos.

## 3. Configurar las variables de entorno

Copia `.env.example` como `.env` en la raíz del proyecto. Completa al menos:

```dotenv
MONGODB_URI=mongodb+srv://...
PUBLIC_FORM_URL=http://localhost:3000/
FRONTEND_ORIGIN=http://localhost:3000
ADMIN_TOKEN=un-secreto-largo-y-aleatorio
INSTITUTION_NAME=Nombre de la institución
```

Para generar un token aleatorio en PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

El formulario y el panel se sirven desde el mismo servidor, por lo que en una instalación normal ambos usarán el mismo origen. Si publicas el frontend en otro dominio, anota el origen completo en `FRONTEND_ORIGIN`; para varios dominios, sepáralos con comas. Los orígenes no declarados serán rechazados por CORS.

Para el correo automático agrega los datos SMTP. Por ejemplo, el proveedor de correo debe darte `SMTP_HOST`, usuario y contraseña de aplicación:

```dotenv
SMTP_HOST=smtp.ejemplo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=cuenta@ejemplo.com
SMTP_PASS=contraseña-de-aplicación
EMAIL_FROM=Órdenes de mantenimiento <cuenta@ejemplo.com>
OT_EMAIL_TO=mantenimiento@institucion.edu
```

También puedes ingresar el correo del solicitante en el formulario: si está presente, se usa como destinatario del PDF; si no, se intenta utilizar `OT_EMAIL_TO`. Cuando SMTP o el destinatario no están configurados, la OT se guarda normalmente y la interfaz avisa que no se envió correo. Para agregar el logotipo institucional real, sustituye el monograma vectorial del encabezado de `services/pdf.service.js` y actualiza `INSTITUTION_NAME`.

El formulario admite hasta cinco evidencias JPG, PNG o HEIC, de máximo 5 MB cada una. Los archivos se guardan en `public/uploads/<id-de-OT>/` y sus rutas quedan asociadas a la orden. El PDF incluye miniaturas JPG/PNG y registra los archivos HEIC sin miniatura porque PDFKit no puede interpretarlos directamente.

## 4. Probar en local

```bash
npm run dev
```

Abre:

- Formulario QR: `http://localhost:3000/`
- Panel: `http://localhost:3000/admin.html`
- Estado del servidor: `http://localhost:3000/health`

En el panel, ingresa el valor de `ADMIN_TOKEN`. Usa el formulario para crear una OT. Comprueba que aparece en el listado, abre su detalle y descarga el PDF. El endpoint público `GET /api/ot/qr` devuelve la URL del formulario y el QR como una imagen Data URL.

La comprobación sintáctica local es:

```bash
npm run check
```

## API REST

`POST /api/ot` es público para registrar el formulario. `GET /api/ot/qr` también es público para que el QR pueda consultarse sin iniciar sesión. Las demás rutas requieren el encabezado `x-admin-token` con el valor de `ADMIN_TOKEN`.

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/api/ot` | Público | Crear OT con `multipart/form-data`; acepta hasta cinco evidencias y trata de enviar el PDF |
| `GET` | `/api/ot` | Admin | Listar con filtros `area`, `tecnico`, `estado`, `desde`, `hasta`, `pagina`, `limite` |
| `GET` | `/api/ot/estadisticas` | Admin | Totales agrupados por mes, área y técnico |
| `GET` | `/api/ot/qr` | Público | Obtener URL pública y código QR |
| `GET` | `/api/ot/:id` | Admin | Consultar el detalle |
| `PUT` | `/api/ot/:id` | Admin | Actualizar campos de la OT |
| `DELETE` | `/api/ot/:id` | Admin | Eliminar una OT |
| `GET` | `/api/ot/:id/pdf` | Admin | Descargar el PDF |

## 5. Desplegar en Render

1. Sube el proyecto a un repositorio Git privado o público **sin incluir `.env`**.
2. En Render, selecciona **New → Web Service** y conecta el repositorio.
3. Configura el entorno como **Node**, el comando de construcción `npm install` y el comando de inicio `npm start`. El directorio raíz es la raíz del proyecto.
4. En **Environment**, configura `MONGODB_URI`, `ADMIN_TOKEN`, `INSTITUTION_NAME`, `FRONTEND_ORIGIN` y `PUBLIC_FORM_URL`. Usa como origen y URL la dirección HTTPS asignada por Render; por ejemplo `https://tu-servicio.onrender.com` y `https://tu-servicio.onrender.com/`.
5. Agrega credenciales SMTP solo si se habilitará el envío de correo. Todas las contraseñas y tokens deben configurarse como secretos en el panel de Render, nunca en el código.
6. Despliega y visita `/health`. Prueba el formulario, `/api/ot/qr` y `/admin.html`.
7. Configura en Atlas la conectividad de red requerida por Render, y rota credenciales si alguna vez quedaron expuestas.

En el nivel gratuito de Render el servicio puede suspenderse al quedar inactivo y tardar en responder al primer acceso. Confirma las condiciones vigentes de Render y Atlas antes de usar el sistema en operación institucional.

Las evidencias se guardan en el disco local del servicio. Si el entorno de despliegue no conserva ese disco entre reinicios o despliegues, las imágenes podrían perderse aunque la OT siga en MongoDB. Para operación permanente, configura almacenamiento persistente o un servicio de objetos antes de depender de las evidencias.

## Consideraciones de seguridad y operación

- Las rutas de administración están protegidas por un token compartido; el token se guarda solo en `sessionStorage` del navegador y viaja mediante HTTPS en producción. Para una institución con varios administradores o roles se recomienda sustituirlo por autenticación individual.
- El número consecutivo no se puede modificar desde la API. Una eliminación no reutiliza el número; puede haber saltos si una creación falla después de reservar un consecutivo.
- La firma se guarda como imagen PNG Data URL dentro de MongoDB y se incluye en el PDF. Antes de usarla, informa a los usuarios sobre el tratamiento y retención de estos datos.
- Las evidencias fotográficas se sirven desde `/uploads/`; establece una política de acceso, respaldos y retención para esos archivos.
- Configura respaldos periódicos y una política institucional de conservación de órdenes.
