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
    const term = e.target.value.toLowerCase().trim();
    const headers = document.querySelectorAll('.tree-node-wrapper'); // We need top level or all? 
    // Actually, getting all wrappers flattens the list. We want to start from root.
    const root = document.getElementById('file-tree');

    // We need to treat only top-level children to avoid double processing in recursion logic, 
    // but our recursion handles DOM elements, so passing the root's children is best.

    // If we use querySelectorAll('.tree-node-wrapper'), we get everyone. 
    // But we want to process hierarchically.
    // So let's grab the direct children of the container.
    const roots = Array.from(root.children);

    roots.forEach(node => {
        filterNode(node, term);
    });
}

function filterNode(wrapper, term) {
    const name = wrapper.dataset.name || '';
    const isDirectory = !!wrapper.querySelector('.folder-content');
    const matchesName = name.includes(term);

    // Case 1: Search cleared
    if (term === '') {
        wrapper.style.display = 'block';
        if (isDirectory) {
            const content = wrapper.querySelector('.folder-content');
            content.classList.remove('open');
            Array.from(content.children).forEach(child => filterNode(child, ''));
        }
        return true;
    }

    if (!isDirectory) {
        // FILE
        if (matchesName) {
            wrapper.style.display = 'block';
            return true;
        } else {
            wrapper.style.display = 'none';
            return false;
        }
    } else {
        // DIRECTORY
        const content = wrapper.querySelector('.folder-content');
        const children = Array.from(content.children);

        // Case 2: Directory NAME matches
        if (matchesName) {
            // Show parent, reset children so they are available if user opens.
            wrapper.style.display = 'block';
            // We generally keep it closed if it's a direct match to keep UI clean, 
            // but the user can open it to see everything.
            content.classList.remove('open');
            // Reset children to be visible (recursively with empty term)
            children.forEach(child => filterNode(child, ''));
            return true;
        }

        // Case 3: Directory doesn't match, check children (Recursive)
        let hasVisibleChild = false;
        children.forEach(child => {
            if (filterNode(child, term)) {
                hasVisibleChild = true;
            }
        });

        if (hasVisibleChild) {
            wrapper.style.display = 'block';
            content.classList.add('open'); // Expand if path contains match
            return true;
        } else {
            wrapper.style.display = 'none';
            return false;
        }
    }
}
