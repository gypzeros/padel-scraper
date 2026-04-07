# Playtomic Padel Court Scraper

Aplicacion que monitoriza la disponibilidad de pistas de padel en Playtomic, envia notificaciones por email y Telegram, y muestra un dashboard web en tiempo real.

## Requisitos

- Node.js 18+
- npm

## Instalacion

```bash
# Instalar dependencias del backend
cd backend
npm install

# Instalar Playwright y el navegador Chromium
npx playwright install chromium

# Instalar dependencias del frontend
cd ../frontend
npm install
```

## Arrancar el proyecto

### Desarrollo (dos terminales)

```bash
# Terminal 1 - Backend
cd backend
npm run dev
# Servidor en http://localhost:3001

# Terminal 2 - Frontend
cd frontend
npm run dev
# Dashboard en http://localhost:5173
```

### Produccion

```bash
# Compilar frontend
cd frontend
npm run build

# Arrancar servidor (sirve el frontend compilado)
cd ../backend
npm start
# Todo en http://localhost:3001
```

## Configuracion de Telegram

1. Abre Telegram y busca **@BotFather**
2. Envia `/newbot` y sigue las instrucciones para crear un bot
3. Copia el **Bot Token** que te da BotFather (formato: `123456:ABC-DEF...`)
4. Para obtener tu **Chat ID**:
   - Envia un mensaje a tu bot
   - Abre en el navegador: `https://api.telegram.org/bot<TU_TOKEN>/getUpdates`
   - Busca `"chat":{"id":XXXXXXX}` — ese numero es tu Chat ID
5. Introduce ambos valores en la pagina de Configuracion del dashboard

## Configuracion de Email

Para usar Gmail como servidor SMTP:

1. Activa la verificacion en dos pasos en tu cuenta de Google
2. Ve a Seguridad > Contrasenas de aplicacion
3. Genera una contrasena de aplicacion para "Correo"
4. En la configuracion usa:
   - Servidor SMTP: `smtp.gmail.com`
   - Puerto: `587`
   - Usuario: tu email de Gmail
   - Contrasena: la contrasena de aplicacion generada

## Estructura del proyecto

```
/backend
  index.js      — servidor Express + Socket.io + scheduler
  scraper.js    — scraping con Playwright (Chromium headless)
  notifier.js   — notificaciones email y Telegram
  db.js         — acceso a SQLite
  config.js     — lectura/escritura de configuracion

/frontend
  src/
    App.jsx
    pages/
      Dashboard.jsx   — estado del scraper en tiempo real
      Results.jsx     — pistas encontradas
      Config.jsx      — configuracion de busqueda y notificaciones
    components/
      StatusIndicator — indicador de estado del scraper
      CourtCard       — fila de pista encontrada
      LogViewer       — logs en tiempo real via Socket.io
```

## API

| Metodo | Ruta                      | Descripcion                    |
| ------ | ------------------------- | ------------------------------ |
| GET    | `/api/status`             | Estado del scraper             |
| POST   | `/api/scraper/start`      | Iniciar scraper                |
| POST   | `/api/scraper/stop`       | Detener scraper                |
| POST   | `/api/scraper/run`        | Ejecutar una comprobacion      |
| GET    | `/api/config`             | Obtener configuracion          |
| POST   | `/api/config`             | Guardar configuracion          |
| GET    | `/api/courts`             | Listar pistas encontradas      |
| DELETE | `/api/courts`             | Limpiar historial              |
| GET    | `/api/logs`               | Obtener logs                   |
| POST   | `/api/notifications/test` | Enviar notificacion de prueba  |
