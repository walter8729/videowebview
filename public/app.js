/**
 * =======================================================================================
 * APP.JS - Lógica del Lado del Cliente (Frontend)
 * =======================================================================================
 * Este archivo contiene todo el código JavaScript que se ejecuta en el navegador del usuario.
 * Se encarga de:
 * 1. Pedir la lista de videos al servidor.
 * 2. Dibujar el árbol de carpetas y archivos en la pantalla.
 * 3. Manejar los clics (abrir carpetas, reproducir videos).
 * 4. Filtrar la lista cuando el usuario escribe en el buscador.
 */

// Esperamos a que todo el HTML se haya cargado antes de ejecutar nada.
document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar los archivos al iniciar
    fetchFiles();

    // 2. Configurar el buscador
    // Cada vez que el usuario escriba algo ('input'), llamamos a la función filterTree
    document.getElementById('search-input').addEventListener('input', filterTree);
});

// Variable global para guardar el reproductor de video.
// Lo necesitamos global para poder destruirlo y crearlo de nuevo cuando cambiamos de video.
let player = null;

/**
 * Función: fetchFiles
 * -------------------
 * Hace una petición al servidor para obtener la lista de archivos.
 * Es 'async' (asíncrona) porque la petición por red toma tiempo.
 */
async function fetchFiles() {
    try {
        // Pedimos los datos a la ruta que definimos en server.js
        const response = await fetch('/api/files');
        // Convertimos la respuesta de texto a un objeto JSON (datos estructurados)
        const data = await response.json();
        // Llamamos a la función que dibuja el árbol en el HTML
        renderTree(data, document.getElementById('file-tree'));
    } catch (error) {
        console.error('Error obteniendo archivos:', error);
    }
}

/**
 * Función: renderTree
 * -------------------
 * Toma la lista de datos y la convierte en elementos HTML visibles.
 * @param {Array} items - La lista de archivos y carpetas.
 * @param {HTMLElement} container - El elemento HTML donde vamos a poner todo.
 */
function renderTree(items, container) {
    // Limpiamos lo que hubiera antes
    container.innerHTML = '';

    // Si la lista está vacía, mostramos un mensaje bonito
    if (!items || items.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:var(--text-secondary); font-size:0.8rem;">No se encontraron videos en esta carpeta.</div>';
        return;
    }

    // Recorremos cada ítem y lo agregamos al contenedor
    items.forEach(item => {
        const el = createTreeItem(item);
        container.appendChild(el);
    });
}

/**
 * Función: createTreeItem
 * -----------------------
 * Crea el HTML para UN solo archivo o carpeta.
 * Si es una carpeta, se llama a sí misma recursivamente para crear sus hijos.
 */
function createTreeItem(item) {
    // Creamos el contenedor principal del ítem
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node-wrapper';
    // Guardamos el nombre en minúsculas en un atributo de datos para facilitar la búsqueda después
    wrapper.dataset.name = item.name.toLowerCase();

    // Creamos la fila visual (lo que se ve y se puede hacer clic)
    const row = document.createElement('div');
    row.className = 'tree-item';

    // 1. El Ícono (Carpeta o Archivo)
    const icon = document.createElement('span');
    icon.className = item.type === 'directory' ? 'folder-icon' : 'file-icon';
    // Usamos SVG (Gráficos Vectoriales) para los íconos
    icon.innerHTML = item.type === 'directory'
        ? '<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3zm-8.322.12C1.72 3.042 1.95 3 2.19 3h5.396l-.707-.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139z"/></svg>'
        : '<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M6 3a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6z"/></svg>';

    row.appendChild(icon);

    // 2. El Nombre
    const name = document.createElement('span');
    name.textContent = item.name;
    row.appendChild(name);

    wrapper.appendChild(row);

    // LÓGICA EPECÍFICA SEGÚN TIPO
    if (item.type === 'directory') {
        // === ES UNA CARPETA ===
        const content = document.createElement('div');
        content.className = 'folder-content';

        // Recursividad: Si tiene hijos, creamos sus elementos dentro de esta carpeta
        if (item.children) {
            item.children.forEach(child => {
                content.appendChild(createTreeItem(child));
            });
        }

        wrapper.appendChild(content);

        // Evento Click: Abrir/Cerrar carpeta
        row.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita que el clic suba a elementos padres
            const isOpen = content.classList.contains('open');
            if (isOpen) {
                content.classList.remove('open');
                row.style.color = 'var(--text-secondary)';
            } else {
                content.classList.add('open');
                row.style.color = 'var(--text-primary)';
            }
        });

    } else {
        // === ES UN ARCHIVO ===
        // Evento Click: Reproducir video
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            // Quitar resaltado de otros ítems
            document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
            // Resaltar este ítem
            row.classList.add('active');

            playVideo(item);
        });
    }

    return wrapper;
}

/**
 * Función: playVideo
 * ------------------
 * Configura el reproductor para ver el archivo seleccionado.
 */
function playVideo(file) {
    console.log('Reproduciendo:', file);

    // Actualizar Interfaz
    document.getElementById('placeholder').style.display = 'none'; // ocultar mensaje "selecciona video"
    const infoPanel = document.getElementById('info-panel');
    infoPanel.classList.add('visible'); // mostrar panel de info

    document.getElementById('video-title').textContent = file.name;
    const ext = file.name.split('.').pop();
    document.getElementById('file-type').textContent = ext.toUpperCase();

    // Construir URLs
    // encodeURI es importante por si el nombre tiene espacios o caracteres raros.
    const videoUrl = `/videos/${encodeURI(file.relativePath)}`;

    const downloadLink = document.getElementById('download-link');
    downloadLink.href = videoUrl;

    // Determinar tipo para OvenPlayer (el reproductor que usamos)
    let type = 'mp4';
    if (ext.toLowerCase() === 'webm') type = 'webm';
    if (ext.toLowerCase() === 'mkv') type = 'webm'; // Los navegadores modernos suelen reproducir MKV internos como WebM/MP4

    // Si ya existe un reproductor, lo destruimos para limpiar memoria antes de crear uno nuevo
    if (player) {
        player.remove();
    }

    // Crear nueva instancia del reproductor
    player = OvenPlayer.create('player', {
        sources: [
            {
                label: 'Original',
                type: type,
                file: videoUrl
            }
        ],
        autoStart: true,
        controls: true,
        width: '100%',
        aspectRatio: '16:9'
    });
}

/**
 * Función: filterTree
 * --------------------
 * Lógica de búsqueda avanzada.
 * Se ejecuta cada vez que el usuario escribe en la barra de búsqueda.
 */
function filterTree(e) {
    const term = e.target.value.toLowerCase().trim();
    const root = document.getElementById('file-tree');

    // Obtenemos los hijos directos (carpetas o archivos raíz)
    // Array.from convierte una lista de nodos HTML en un Array real de JS
    const roots = Array.from(root.children);

    roots.forEach(node => {
        filterNode(node, term);
    });
}

/**
 * Función: filterNode (Recursiva)
 * -------------------------------
 * Determina si un nodo (archivo o carpeta) debe mostrarse u ocultarse según la búsqueda.
 * 
 * @param {HTMLElement} wrapper - El elemento HTML que contiene el ítem.
 * @param {string} term - El texto que buscamos.
 * @returns {boolean} - true si el nodo es visible, false si está oculto.
 */
function filterNode(wrapper, term) {
    const name = wrapper.dataset.name || '';
    // Buscamos si tiene contenido dentro para saber si es carpeta
    const isDirectory = !!wrapper.querySelector('.folder-content');

    // Verificamos si el nombre coincide con la búsqueda
    const matchesName = name.includes(term);

    // CASO 1: Búsqueda vacía (usuario borró el texto)
    if (term === '') {
        wrapper.style.display = 'block'; // Mostrar todo
        if (isDirectory) {
            const content = wrapper.querySelector('.folder-content');
            content.classList.remove('open'); // Colapsar carpetas para ordenar vista
            wrapper.querySelector('.tree-item').style.color = 'var(--text-secondary)';
            // Resetear recursivamente todos los hijos
            Array.from(content.children).forEach(child => filterNode(child, ''));
        }
        return true;
    }

    if (!isDirectory) {
        // === ES UN ARCHIVO ===
        if (matchesName) {
            wrapper.style.display = 'block';
            return true;
        } else {
            wrapper.style.display = 'none';
            return false;
        }
    } else {
        // === ES UNA CARPETA ===
        const content = wrapper.querySelector('.folder-content');
        const children = Array.from(content.children);

        // CASO 2: El nombre de la propia carpeta coincide
        if (matchesName) {
            wrapper.style.display = 'block';
            // Mantenemos la carpeta cerrada visualmente para no saturar al usuario,
            // pero hacemos visibles sus hijos por si el usuario decide abrirla.
            content.classList.remove('open');
            wrapper.querySelector('.tree-item').style.color = 'var(--text-secondary)';

            // "Reiniciar" visualización de hijos (mostrar todos internamente)
            children.forEach(child => filterNode(child, ''));
            return true;
        }

        // CASO 3: El nombre no coincide, pero tal vez sus HIJOS sí coinciden.
        let hasVisibleChild = false;

        // Revisar recursivamente cada hijo
        children.forEach(child => {
            if (filterNode(child, term)) {
                hasVisibleChild = true;
            }
        });

        if (hasVisibleChild) {
            // Si al menos un hijo coincide, mostramos esta carpeta y la EXPANDIMOS automáticamente
            wrapper.style.display = 'block';
            content.classList.add('open');
            wrapper.querySelector('.tree-item').style.color = 'var(--text-primary)';
            return true;
        } else {
            // Ni la carpeta ni sus hijos coinciden -> Ocultar
            wrapper.style.display = 'none';
            return false;
        }
    }
}
