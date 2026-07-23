# Cómo generar el APK de "Rey del Huevo"

Ya dejé el proyecto listo con Capacitor configurado (ícono, splash screen, nombre de
la app, y apuntando a tu backend en `inventario-backend-ftw6.onrender.com`). Solo falta
el paso de compilación, que necesita conexión a internet y no puedo correr yo mismo.

Tienes dos caminos. **El primero es el más fácil si solo tienes el celular.**

---

## Opción A: Compilar en la nube con GitHub Actions (no necesitas instalar nada)

1. Sube esta carpeta completa a un repositorio de GitHub (reemplaza el contenido de
   tu carpeta `frontend/` actual por esta, o sube esto como repo nuevo).
2. Entra a la pestaña **Actions** del repo en GitHub (desde el navegador del celular
   funciona bien).
3. Verás el workflow **"Build APK"** — dale clic y luego **"Run workflow"**.
4. Espera unos 5-8 minutos. Cuando termine, en esa misma página vas a ver un archivo
   descargable llamado **rey-del-huevo-apk** — ese es tu `.apk`.
5. Descárgalo al celular e instálalo (puede que Android te pida activar "Instalar
   apps de orígenes desconocidos" la primera vez).

Ya está el workflow armado en `.github/workflows/build-apk.yml`, no hay que tocar nada.

---

## Opción B: Compilar en una PC con Android Studio

1. Instala [Node.js](https://nodejs.org) y [Android Studio](https://developer.android.com/studio)
   (Android Studio ya trae el SDK y Gradle, no necesitas instalarlos aparte).
2. Abre una terminal en esta carpeta y corre:
   ```
   npm install
   npm run android:add
   npm run android:assets
   npm run android:sync
   npm run android:open
   ```
3. Se abre Android Studio. Ve a **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. El `.apk` queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## Notas

- El APK generado por estos pasos es un **APK de debug**, instalable directo en
  cualquier Android sin cuenta de desarrollador ni firma especial. Sirve perfecto
  para uso interno del negocio.
- Si más adelante quieres subirlo a Google Play, hay que generar una versión
  "release" firmada — es un paso extra, avísame cuando llegues ahí.
- La app ya apunta a `https://inventario-backend-ftw6.onrender.com`, así que va a
  funcionar igual que la versión web, con la ventaja de tener ícono propio y
  abrir directo sin pasar por el navegador.
