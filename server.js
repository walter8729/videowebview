/**
 * =======================================================================================
 * SERVER.JS - Servidor de Video con Caché en Memoria + Watcher de Archivos
 * =======================================================================================
 * MEJORAS RESPECTO A LA VERSIÓN ANTERIOR:
 *
 * PROBLEMA ANTERIOR:
 *   - Cada petición a /api/files disparaba un escaneo COMPLETO y SÍNCRONO del disco.
 *   - fs.readdirSync/fs.statSync bloquean el Event Loop de Node.js.
 *   - Con 10 clientes simultáneos = 10 escaneos completos al mismo tiempo → servidor lento.
 *
 * SOLUCIÓN IMPLEMENTADA:
 *   1. CACHÉ EN MEMORIA: El árbol de archivos se escanea UNA SOLA VEZ al iniciar
 *      y se guarda en una variable. Las peticiones siguientes responden al instante
 *      desde memoria RAM, sin tocar el disco.
 *
 *   2. ESCANEO ASÍNCRONO: Se usa fs.promises (async/await) en lugar de las versiones
 *      síncronas (*Sync). Esto significa que Node.js puede seguir atendiendo otras
 *      peticiones MIENTRAS escanea, en vez de bloquearse.
 *
 *   3. FILE WATCHER: Se usa fs.watch() para vigilar la carpeta de videos.
 *      Cuando se agrega, elimina o renombra un archivo, el watcher lo detecta
 *      y programa un re-escaneo automático.
 *
 *   4. DEBOUNCE: El re-escaneo tiene un retraso de 2 segundos. Si se detectan
 *      varios cambios seguidos (ej: copiar 50 archivos), el timer se reinicia
 *      con cada cambio y solo escanea UNA VEZ cuando todo se estabiliza.
 *      Esto evita re-escaneos repetitivos innecesarios.
 *
 * RESULTADO: El servidor puede atender cientos de clientes sin esfuerzo,
 * y la lista de videos siempre estará actualizada automáticamente.
 */

// 1. IMPORTACIÓN DE LIBRERÍAS
// ----------------------------
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

// 2. CONFIGURACIÓN
// ----------------
const app = express();
const PORT = 3000;

const ROOT_DIR = process.env.VIDEO_ROOT || path.resolve(__dirname, '..');
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm', '.avi', '.mov'];

// 3. CACHÉ EN MEMORIA
// -------------------
// Esta es la variable central de la mejora.
// Guarda el árbol de archivos para no tener que re-escanear en cada petición.
let cachedTree = null;         // El árbol de archivos (null = todavía no escaneado)
let isScanRunning = false;     // Bandera para evitar dos escaneos simultáneos
let debounceTimer = null;      // Referencia al timer del debounce

// 4. MIDDLEWARE
// ------------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(ROOT_DIR));


// 5. ESCANEO ASÍNCRONO DE DIRECTORIOS
// ------------------------------------
/**
 * Versión asíncrona del escaneo de directorios.
 * Usa fs.promises en lugar de funciones *Sync para no bloquear el Event Loop.
 * 
 * @param {string} dir - Ruta absoluta del directorio a escanear.
 * @returns {Promise<Array>} - Promesa que resuelve con el árbol de archivos.
 */
async function scanDirectoryAsync(dir) {
    let list;

    try {
        // fs.promises.readdir es la versión NO bloqueante de fs.readdirSync
        list = await fs.promises.readdir(dir);
    } catch (e) {
        console.warn(`Saltando directorio sin acceso: ${dir}`);
        return [];
    }

    // Procesamos todos los archivos en PARALELO con Promise.all
    // En vez de esperar uno por uno, lanzamos todas las operaciones a la vez.
    const results = await Promise.all(
        list
            .filter(file => !file.startsWith('.') && file !== 'node_modules' && file !== 'web_view')
            .map(async (file) => {
                const filePath = path.join(dir, file);
                let stat;

                try {
                    stat = await fs.promises.stat(filePath);
                } catch (e) {
                    return null; // Ignorar archivos inaccesibles
                }

                if (stat.isDirectory()) {
                    const children = await scanDirectoryAsync(filePath);

                    if (children.length > 0) {
                        return {
                            name: file,
                            type: 'directory',
                            relativePath: path.relative(ROOT_DIR, filePath).replace(/\\/g, '/'),
                            children: children
                        };
                    }
                    return null; // Carpeta vacía, la ignoramos

                } else {
                    const ext = path.extname(file).toLowerCase();

                    if (VIDEO_EXTENSIONS.includes(ext)) {
                        return {
                            name: file,
                            type: 'file',
                            relativePath: path.relative(ROOT_DIR, filePath).replace(/\\/g, '/'),
                            size: stat.size
                        };
                    }
                    return null; // No es un video
                }
            })
    );

    // Filtramos los nulls (archivos ignorados) y ordenamos: carpetas primero, luego por nombre
    return results
        .filter(Boolean)
        .sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'directory' ? -1 : 1;
        });
}


// 6. GESTOR DE CACHÉ
// ------------------
/**
 * Inicia un escaneo y actualiza la caché cuando termina.
 * Si ya hay un escaneo en curso, no lanza uno nuevo (evita trabajo duplicado).
 */
async function refreshCache() {
    if (isScanRunning) {
        console.log('[Cache] Escaneo ya en curso, omitiendo solicitud duplicada.');
        return;
    }

    isScanRunning = true;
    console.log('[Cache] Iniciando escaneo de directorio...');
    const startTime = Date.now();

    try {
        const tree = await scanDirectoryAsync(ROOT_DIR);
        cachedTree = tree; // ← Actualizar la caché con los nuevos datos
        const elapsed = Date.now() - startTime;
        console.log(`[Cache] Escaneo completado en ${elapsed}ms. ${countFiles(tree)} videos encontrados.`);
    } catch (err) {
        console.error('[Cache] Error durante el escaneo:', err);
    } finally {
        isScanRunning = false;
    }
}

/** Cuenta el total de archivos de video en el árbol (para el log). */
function countFiles(tree) {
    return tree.reduce((acc, item) => {
        if (item.type === 'file') return acc + 1;
        if (item.type === 'directory') return acc + countFiles(item.children);
        return acc;
    }, 0);
}


// 7. WATCHER DE ARCHIVOS CON DEBOUNCE
// ------------------------------------
/**
 * fs.watch vigila la carpeta ROOT_DIR en busca de cambios.
 * 'recursive: true' permite detectar cambios en sub-carpetas también.
 * 
 * El DEBOUNCE evita re-escaneos repetitivos:
 * - Si se copian 100 archivos, el watcher dispara 100 eventos muy rápido.
 * - Sin debounce: 100 escaneos innecesarios.
 * - Con debounce de 2s: espera 2 segundos de "silencio" y escanea UNA sola vez.
 */
const DEBOUNCE_DELAY_MS = 2000; // 2 segundos de espera tras el último cambio

function setupWatcher() {
    try {
        const watcher = fs.watch(ROOT_DIR, { recursive: true }, (eventType, filename) => {
            // Ignorar cambios en archivos que no son videos para no re-escanear innecesariamente
            if (filename) {
                const ext = path.extname(filename).toLowerCase();
                // Aceptamos también sin extensión porque podría ser una carpeta nueva
                if (ext && !VIDEO_EXTENSIONS.includes(ext)) return;
            }

            console.log(`[Watcher] Cambio detectado: ${eventType} → ${filename || 'desconocido'}`);

            // Cancelar el timer anterior si existe (reiniciar el debounce)
            if (debounceTimer) clearTimeout(debounceTimer);

            // Programar un nuevo escaneo para cuando los cambios se estabilicen
            debounceTimer = setTimeout(() => {
                console.log('[Watcher] Cambios estabilizados. Actualizando caché...');
                refreshCache();
            }, DEBOUNCE_DELAY_MS);
        });

        watcher.on('error', (err) => {
            console.error('[Watcher] Error en el watcher de archivos:', err);
        });

        console.log(`[Watcher] Vigilando cambios en: ${ROOT_DIR}`);
    } catch (err) {
        // En algunos sistemas (ej: redes SMB/NFS) fs.watch puede no ser compatible.
        // En ese caso, advertimos al usuario pero el servidor sigue funcionando con caché manual.
        console.warn('[Watcher] No se pudo iniciar el watcher automático (puede ser una ruta de red).');
        console.warn('[Watcher] La caché se actualizará solo al reiniciar el servidor o via /api/refresh.');
    }
}


// 8. RUTAS DE LA API
// ------------------

/**
 * GET /api/files
 * Responde con el árbol de videos desde la caché en memoria.
 * Si la caché aún no está lista (primer arranque lento), devuelve un estado 503.
 */
app.get('/api/files', (req, res) => {
    if (cachedTree === null) {
        // La caché todavía no está lista (el escaneo inicial aún no terminó)
        return res.status(503).json({
            error: 'El servidor está iniciando. Por favor, reintenta en unos segundos.',
            loading: true
        });
    }
    // ✅ Respuesta instantánea desde memoria, sin tocar el disco
    res.json(cachedTree);
});

/**
 * POST /api/refresh
 * Permite forzar manualmente un re-escaneo de la caché.
 * Útil si el watcher falla (ej: carpetas de red) o para uso administrativo.
 * Ejemplo de uso: fetch('/api/refresh', { method: 'POST' })
 */
app.post('/api/refresh', async (req, res) => {
    console.log('[API] Re-escaneo manual solicitado.');
    refreshCache(); // Lanzamos el escaneo en segundo plano (no esperamos a que termine)
    res.json({ message: 'Re-escaneo iniciado. La caché se actualizará en breve.' });
});

// Fallback para SPA
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// 9. INICIAR EL SERVIDOR
// ----------------------
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n--- SERVIDOR DE VIDEO INICIADO ---`);
    console.log(`Interfaz disponible en: http://localhost:${PORT}`);
    console.log(`Sirviendo videos desde: ${ROOT_DIR}`);

    // Escaneo inicial al arrancar el servidor
    await refreshCache();

    // Iniciar el watcher para detectar cambios futuros automáticamente
    setupWatcher();
});
