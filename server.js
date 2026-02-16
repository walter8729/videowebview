/**
 * =======================================================================================
 * SERVER.JS - El Punto de Entrada Principal de nuestro Servidor de Video
 * =======================================================================================
 * Este archivo configura un servidor web utilizando Node.js y el framework Express.
 * 
 * Qué hace este código:
 * 1. Configura variables de entorno (como claves secretas o rutas).
 * 2. Escanea una carpeta específica en tu disco duro para encontrar videos.
 * 3. Crea una lista (en formato JSON) de todos esos archivos encontrados.
 * 4. Sirve la interfaz web (HTML/JS) al navegador del usuario.
 * 5. Sirve los archivos de video reales para que puedan reproducirse.
 */

// 1. IMPORTACIÓN DE LIBRERÍAS
// ----------------------------
// 'dotenv' es una herramienta que carga configuración desde un archivo ".env".
// Es una buena práctica para mantener configuraciones separadas del código.
require('dotenv').config();

// 'express' es el framework web más popular para Node.js.
// Maneja las peticiones (cuando un usuario visita una página) y las respuestas.
const express = require('express');

// 'fs' significa 'File System' (Sistema de Archivos). 
// Permite a Node.js leer y escribir archivos en tu computadora.
// Lo usamos para leer el contenido de la carpeta de videos.
const fs = require('fs');

// 'path' es una utilidad para trabajar con rutas de archivos y carpetas.
// Ayuda a asegurar que las rutas funcionen bien tanto en Windows ("\") como en Mac/Linux ("/").
const path = require('path');

// 2. CONFIGURACIÓN
// ----------------
// Creamos una instancia de la aplicación Express.
const app = express();

// El número de puerto en el que escuchará el servidor.
// Accederás a él en tu navegador como http://localhost:3000
const PORT = 3000;

/**
 * ROOT_DIR: La carpeta donde están almacenados tus videos.
 * Prioridad de decisión:
 * 1. Revisa si 'VIDEO_ROOT' está definido en el archivo .env.
 * 2. Si no, usa por defecto la carpeta padre de este proyecto '..'.
 *    - __dirname es una variable especial que contiene la ruta del archivo actual.
 *    - path.resolve combina las rutas de forma segura.
 */
const ROOT_DIR = process.env.VIDEO_ROOT || path.resolve(__dirname, '..');

// Lista de extensiones de archivo que consideramos como "videos".
// Se usan en minúsculas para facilitar la comparación.
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm', '.avi', '.mov'];

// 3. CONFIGURACIÓN DE MIDDLEWARE
// ------------------------------
// Los "Middleware" son funciones que se ejecutan antes del manejador final.
// app.use(express.static(...)) le dice a Express que sirva archivos "estáticos" 
// como HTML, CSS, JS e Imágenes directamente.
// Esto sirve los archivos de la carpeta 'public' cuando alguien visita la página de inicio.
app.use(express.static(path.join(__dirname, 'public')));

// "Montamos" la carpeta ROOT_DIR (tus videos) en la ruta URL '/videos'.
// Esto es un truco de mapeo y seguridad muy importante:
// - Ruta Real en PC:   c:\CUDA\mis_vacaciones.mp4    (Ruta interna sensible)
// - URL Web:           http://localhost:3000/videos/mis_vacaciones.mp4
// El usuario solo ve "/videos/...", nunca la ruta real de tu disco duro.
app.use('/videos', express.static(ROOT_DIR));


/**
 * 4. LA LÓGICA PRINCIPAL: ESCANEO RECURSIVO DE DIRECTORIOS
 * --------------------------------------------------------
 * Esta función busca en una carpeta y encuentra todos los videos dentro,
 * incluso si están dentro de sub-carpetas (esa es la parte "recursiva").
 * 
 * @param {string} dir - La ruta absoluta del directorio a escanear.
 * @returns {Array} - Una lista de objetos representando archivos y carpetas.
 */
function scanDirectory(dir) {
    let results = [];
    let list;

    // Intentamos leer el directorio. Si falla (ej. permiso denegado), capturamos el error.
    try {
        // fs.readdirSync lee el directorio de forma "Síncrona" (pausa el código hasta terminar).
        // Devuelve un array (lista) con los nombres de los archivos.
        list = fs.readdirSync(dir);
    } catch (e) {
        console.warn(`Saltando directorio sin acceso: ${dir}`);
        return []; // Retornamos lista vacía si no podemos leerlo
    }

    // Recorremos cada archivo/carpeta encontrado en 'dir'
    list.forEach(file => {
        // FILTRADO:
        // Saltamos archivos ocultos (empiezan con .), la carpeta 'node_modules' (es gigante),
        // y nuestra propia carpeta de código 'web_view' para evitar desorden.
        if (file.startsWith('.') || file === 'node_modules' || file === 'web_view') return;

        // Creamos la ruta absoluta completa para este ítem
        const filePath = path.join(dir, file);
        let stat;

        // Obtenemos "stats" (información) sobre el archivo: ¿Es archivo? ¿Es carpeta? ¿Cuánto pesa?
        try {
            stat = fs.statSync(filePath);
        } catch (e) {
            return; // Saltamos si no podemos leer la info
        }

        if (stat.isDirectory()) {
            // === AQUÍ OCURRE LA RECURSIVIDAD ===
            // Si es una carpeta, llamamos a ESTA MISMA función scanDirectory() sobre ella.
            // Esto es lo que nos permite explorar niveles profundos de carpetas.
            const children = scanDirectory(filePath);

            // DECISIÓN LÓGICA:
            // Solo añadimos esta carpeta a la lista si contiene algo útil
            // (ya sean videos directos o subcarpetas con videos).
            if (children.length > 0) {
                results.push({
                    name: file,
                    type: 'directory',
                    // Creamos una ruta relativa para que el frontend la use luego
                    relativePath: path.relative(ROOT_DIR, filePath).replace(/\\/g, '/'),
                    children: children // Adjuntamos los resultados encontrados dentro
                });
            }
        } else {
            // Es un archivo. Verificamos si es un video.
            const ext = path.extname(file).toLowerCase(); // Obtenemos extensión ej: '.mp4'

            if (VIDEO_EXTENSIONS.includes(ext)) {
                // ¡Es un video! Lo agregamos a nuestra lista de resultados.
                results.push({
                    name: file,
                    type: 'file',
                    relativePath: path.relative(ROOT_DIR, filePath).replace(/\\/g, '/'),
                    size: stat.size
                });
            }
        }
    });

    // LIMPIEZA FINAL: Ordenar
    // Ordenamos para que las Carpetas aparezcan primero (A-Z), y luego los Archivos (A-Z).
    // Esto hace que la vista de árbol se vea estándar y organizada.
    return results.sort((a, b) => {
        // Si ambos son del mismo tipo, ordenar por nombre
        if (a.type === b.type) return a.name.localeCompare(b.name);
        // Si son diferentes, Carpeta (-1) va antes que Archivo (1)
        return a.type === 'directory' ? -1 : 1;
    });
}

// 5. DEFINICIÓN DE RUTAS API
// --------------------------
// Cuando el frontend pide datos (visita /api/files), ejecuta esta función.
// (req = la petición del usuario, res = la respuesta que enviamos)
app.get('/api/files', (req, res) => {
    console.log('Escaneando archivos...');
    try {
        // Llamamos a nuestra función de escaneo empezando en la carpeta raíz
        const tree = scanDirectory(ROOT_DIR);
        // Respondemos con los datos en formato JSON
        res.json(tree);
    } catch (err) {
        // Si algo se rompe, lo registramos y decimos al usuario "Error de Servidor" (500)
        console.error(err);
        res.status(500).json({ error: 'Fallo al escanear directorio' });
    }
});

// Ruta de Respaldo (Fallback):
// Si el usuario pide cualquier otra URL, simplemente le enviamos el index.html principal.
// Común en Aplicaciones de Una Sola Página (SPAs).
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 6. INICIAR EL SERVIDOR
// ----------------------
// Decimos a Express que empiece a escuchar conexiones en el PUERTO especificado.
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n--- SERVIDOR DE VIDEO INICIADO ---`);
    console.log(`Interfaz disponible en: http://localhost:${PORT}`);
    console.log(`Sirviendo videos desde: ${ROOT_DIR}`);
});
