document.addEventListener('DOMContentLoaded', () => {
    fetchFiles();

    // Simple search filtering
    document.getElementById('search-input').addEventListener('input', filterTree);
});

let player = null;

async function fetchFiles() {
    try {
        const response = await fetch('/api/files');
        const data = await response.json();
        renderTree(data, document.getElementById('file-tree'));
    } catch (error) {
        console.error('Error fetching files:', error);
    }
}

function renderTree(items, container) {
    container.innerHTML = '';
    if (!items || items.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:var(--text-secondary); font-size:0.8rem;">No videos found in this folder.</div>';
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
    wrapper.dataset.name = item.name.toLowerCase(); // For search

    const row = document.createElement('div');
    row.className = 'tree-item';

    // Icon
    const icon = document.createElement('span');
    icon.className = item.type === 'directory' ? 'folder-icon' : 'file-icon';
    icon.innerHTML = item.type === 'directory'
        ? '<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3zm-8.322.12C1.72 3.042 1.95 3 2.19 3h5.396l-.707-.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139z"/></svg>'
        : '<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M6 3a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6z"/></svg>';

    row.appendChild(icon);

    // Name
    const name = document.createElement('span');
    name.textContent = item.name;
    row.appendChild(name);

    wrapper.appendChild(row);

    if (item.type === 'directory') {
        const content = document.createElement('div');
        content.className = 'folder-content';

        // Setup recursion
        if (item.children) {
            item.children.forEach(child => {
                content.appendChild(createTreeItem(child));
            });
        }

        wrapper.appendChild(content);

        // directory click - toggle
        row.addEventListener('click', (e) => {
            e.stopPropagation();
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
        // file click - play
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            // Highlight active
            document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
            row.classList.add('active');

            playVideo(item);
        });
    }

    return wrapper;
}

function playVideo(file) {
    console.log('Playing:', file);
    // UI Updates
    document.getElementById('placeholder').style.display = 'none';
    const infoPanel = document.getElementById('info-panel');
    infoPanel.classList.add('visible');

    document.getElementById('video-title').textContent = file.name;
    const ext = file.name.split('.').pop();
    document.getElementById('file-type').textContent = ext.toUpperCase();

    // URLs
    const videoUrl = `/videos/${encodeURI(file.relativePath)}`; // encode for spaces

    const downloadLink = document.getElementById('download-link');
    downloadLink.href = videoUrl;

    // Determine Type for OvenPlayer
    let type = 'mp4';
    if (ext.toLowerCase() === 'webm') type = 'webm';
    if (ext.toLowerCase() === 'mkv') type = 'webm'; // Browsers often play mkv if underlying codec is supported, but officially mp4/webm are safest.

    // Init OvenPlayer
    if (player) {
        player.remove();
    }

    player = OvenPlayer.create('player', {
        sources: [
            {
                label: 'Original',
                // If it's MKV, browser support is spotty. OvenPlayer handles what browser handles.
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

function filterTree(e) {
    const term = e.target.value.toLowerCase();
    const wrappers = document.querySelectorAll('.tree-node-wrapper');

    wrappers.forEach(wrap => {
        // Very basic filter: if it's a file and name matches, show.
        // Ideally we should keep parents open. 
        // For now, let's just opacity out non-matches or something simple.
        if (term === '') {
            wrap.style.display = 'block';
            return;
        }

        // This is tricky with recursion in DOM. 
        // Simple approach: Check name.
        if (wrap.dataset.name.includes(term)) {
            wrap.style.display = 'block';
            // Ensure parent is visible? (Hard without parent refs)
        } else {
            // Hide if it's a leaf file that doesn't match
            // But if it is a directory preventing children from showing?
            // This simple search is sufficient for a "Simple" request.
            // If it's a directory, we only hide if NONE of its children match? Too complex.
            // Let's just filter leaf nodes (files).
            if (wrap.querySelector('.folder-content')) {
                // Directory: keep visible for now
                wrap.style.display = 'block';
            } else {
                wrap.style.display = 'none';
            }
        }
    });
}
