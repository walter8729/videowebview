/**
 * =======================================================================================
 * APP.JS - Lógica del Cliente (Frontend)
 * =======================================================================================
 * MEJORAS RESPECTO A LA VERSIÓN ANTERIOR:
 *  - Manejo del estado 503 (servidor iniciando): reintenta automáticamente cada 3s.
 *  - Botón de "Actualizar lista" que llama a POST /api/refresh y recarga el árbol.
 */

document.addEventListener('DOMContentLoaded', () => {
    fetchFiles();
    document.getElementById('search-input').addEventListener('input', (e) => filterTree(e.target.value));
    document.getElementById('refresh-btn').addEventListener('click', handleRefresh);



    document.getElementById('clear-btn').addEventListener('click', () => {
        const input = document.getElementById('search-input');
        input.value = '';
        input.focus();
        filterTree('');
    });
});
// Global variable to store total count for restoration
let globalTotalVideos = 0;

let player = null;

// ─────────────────────────────────────────────
// CARGA Y REFRESCO DE ARCHIVOS
// ─────────────────────────────────────────────

/**
 * Pide la lista de archivos al servidor.
 * Si el servidor responde 503 (caché aún no lista), reintenta automáticamente cada 3s.
 */
async function fetchFiles() {
    const treeContainer = document.getElementById('file-tree');
    try {
        const response = await fetch('/api/files');

        // 503 = el servidor está iniciando su escaneo inicial
        if (response.status === 503) {
            treeContainer.innerHTML = `
                <div class="status-msg">
                    <div class="loading-spinner"></div>
                    <span>Escaneando carpeta...</span>
                </div>`;
            // Reintentar en 3 segundos
            setTimeout(fetchFiles, 3000);
            return;
        }

        const data = await response.json();
        updateVideoCount(data);
        renderTree(data, treeContainer);

    } catch (error) {
        console.error('Error obteniendo archivos:', error);
        treeContainer.innerHTML = `<div class="status-msg error">Error de conexión. Reintentando...</div>`;
        setTimeout(fetchFiles, 5000);
    }
}

/**
 * Llama al endpoint de refresco manual y recarga el árbol tras 2.5s
 * (tiempo para que el servidor termine el re-escaneo).
 */
async function handleRefresh() {
    const btn = document.getElementById('refresh-btn');
    btn.disabled = true;
    btn.classList.add('loading');

    try {
        await fetch('/api/refresh', { method: 'POST' });
        // Esperamos un poco a que el servidor termine de escanear, luego recargamos
        setTimeout(async () => {
            await fetchFiles();
            btn.disabled = false;
            btn.classList.remove('loading');
        }, 2500);
    } catch (e) {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}


// ─────────────────────────────────────────────
// RENDERIZADO DEL ÁRBOL
// ─────────────────────────────────────────────

function renderTree(items, container) {
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="status-msg">No se encontraron videos en esta carpeta.</div>';
        return;
    }

    items.forEach(item => {
        const el = createTreeItem(item);
        container.appendChild(el);
    });
}

function createTreeItem(item) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node-wrapper';
    wrapper.dataset.name = item.name.toLowerCase();

    const row = document.createElement('div');
    row.className = 'tree-item';

    const icon = document.createElement('span');
    icon.className = item.type === 'directory' ? 'folder-icon' : 'file-icon';
    icon.innerHTML = item.type === 'directory'
        ? '<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3zm-8.322.12C1.72 3.042 1.95 3 2.19 3h5.396l-.707-.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139z"/></svg>'
        : '<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M6 3a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6z"/></svg>';

    row.appendChild(icon);

    const name = document.createElement('span');
    name.textContent = item.name;
    row.appendChild(name);

    wrapper.appendChild(row);

    if (item.type === 'directory') {
        const content = document.createElement('div');
        content.className = 'folder-content';

        if (item.children) {
            item.children.forEach(child => {
                content.appendChild(createTreeItem(child));
            });
        }

        wrapper.appendChild(content);

        row.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = content.classList.contains('open');
            content.classList.toggle('open', !isOpen);
            row.style.color = isOpen ? 'var(--text-secondary)' : 'var(--text-primary)';
        });

    } else {
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
            row.classList.add('active');
            playVideo(item);
        });
    }

    return wrapper;
}


// ─────────────────────────────────────────────
// REPRODUCTOR DE VIDEO
// ─────────────────────────────────────────────

function playVideo(file) {
    document.getElementById('placeholder').style.display = 'none';
    const infoPanel = document.getElementById('info-panel');
    infoPanel.classList.add('visible');

    document.getElementById('video-title').textContent = file.name;
    const ext = file.name.split('.').pop();
    document.getElementById('file-type').textContent = ext.toUpperCase();

    const videoUrl = `/videos/${encodeURI(file.relativePath)}`;
    document.getElementById('download-link').href = videoUrl;

    let type = 'mp4';
    if (ext.toLowerCase() === 'webm') type = 'webm';
    if (ext.toLowerCase() === 'mkv') type = 'webm';

    if (player) player.remove();

    player = OvenPlayer.create('player', {
        sources: [{ label: 'Original', type: type, file: videoUrl }],
        autoStart: true,
        controls: true,
        width: '100%',
        aspectRatio: '16:9'
    });
}


// ─────────────────────────────────────────────
// BÚSQUEDA / FILTRO
// ─────────────────────────────────────────────

function updateVideoCount(items) {
    globalTotalVideos = countTotalVideos(items);
    updateCountDisplay(globalTotalVideos, false);
}

function updateCountDisplay(count, isFiltered) {
    const countElement = document.getElementById('video-count-display');
    if (!countElement) return;

    if (isFiltered) {
        countElement.textContent = `${count} videos encontrados (filtrado)`;
        // If filtered count is same as total, show standard msg? 
        // Maybe "X videos encontrados" is fine, but user asked for "found with criteria"
    } else {
        countElement.textContent = `${count} Videos encontrados`;
    }
}

// ─────────────────────────────────────────────
// BÚSQUEDA / FILTRO
// ─────────────────────────────────────────────

function filterTree(term) {
    term = term.toLowerCase().trim();
    const root = document.getElementById('file-tree');
    const clearBtn = document.getElementById('clear-btn');

    // Show/hide clear button
    if (clearBtn) {
        clearBtn.style.display = term ? 'flex' : 'none';
    }

    let matchCount = 0;
    Array.from(root.children).forEach(node => {
        matchCount += filterNode(node, term);
    });

    if (term === '') {
        updateCountDisplay(globalTotalVideos, false);
    } else {
        updateCountDisplay(matchCount, true);
    }
}

function filterNode(wrapper, term) {
    const name = wrapper.dataset.name || '';
    const isDirectory = !!wrapper.querySelector('.folder-content');
    const matchesName = name.includes(term);

    if (term === '') {
        wrapper.style.display = 'block';
        if (isDirectory) {
            const content = wrapper.querySelector('.folder-content');
            content.classList.remove('open');
            wrapper.querySelector('.tree-item').style.color = 'var(--text-secondary)';

            let count = 0;
            Array.from(content.children).forEach(child => {
                count += filterNode(child, '');
            });
            return count;
        }
        return 1; // It's a file
    }

    if (!isDirectory) {
        if (matchesName) {
            wrapper.style.display = 'block';
            return 1;
        } else {
            wrapper.style.display = 'none';
            return 0;
        }
    } else {
        // Directory
        const content = wrapper.querySelector('.folder-content');
        const children = Array.from(content.children);
        let countInSubtree = 0;

        if (matchesName) {
            // Folder matches -> show distinct highlight maybe? or just show everything inside
            wrapper.style.display = 'block';
            content.classList.remove('open'); // Maybe open? User might want to see contents. 
            // Usually if folder matches, you show folder. 
            // But to count items inside, we must traverse.

            // Current UX: show folder closed.
            wrapper.querySelector('.tree-item').style.color = 'var(--text-secondary)'; // or highlight?

            // To get accurate count, even if folder matches, we count all children as matches
            children.forEach(child => {
                countInSubtree += filterNode(child, ''); // Reset filter for children so they are all "visible" logically
            });
            return countInSubtree;
        } // End matchesName

        let hasVisibleChild = false;
        children.forEach(child => {
            const childCount = filterNode(child, term);
            if (childCount > 0) {
                hasVisibleChild = true;
                countInSubtree += childCount;
            }
        });

        if (hasVisibleChild) {
            wrapper.style.display = 'block';
            content.classList.add('open');
            wrapper.querySelector('.tree-item').style.color = 'var(--text-primary)';
            return countInSubtree;
        } else {
            wrapper.style.display = 'none';
            return 0;
        }
    }
}

function countTotalVideos(items) {
    let count = 0;
    if (!items) return 0;

    for (const item of items) {
        if (item.type === 'directory') {
            if (item.children) {
                count += countTotalVideos(item.children);
            }
        } else {
            count++;
        }
    }
    return count;
}
