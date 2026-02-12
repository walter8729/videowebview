require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
// Scan the parent directory (c:\CUDA)
const ROOT_DIR = process.env.VIDEO_ROOT || path.resolve(__dirname, '..');
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm', '.avi', '.mov'];

app.use(express.static(path.join(__dirname, 'public')));

// Mount the parent directory to serve video files
// Allows accessing c:\CUDA\video.mp4 as /videos/video.mp4
app.use('/videos', express.static(ROOT_DIR));

function scanDirectory(dir) {
    let results = [];
    let list;
    try {
        list = fs.readdirSync(dir);
    } catch (e) {
        console.warn(`Skipping access denied directory: ${dir}`);
        return [];
    }

    list.forEach(file => {
        // Skip hidden files, node_modules, and this web_view folder
        if (file.startsWith('.') || file === 'node_modules' || file === 'web_view') return;

        const filePath = path.join(dir, file);
        let stat;
        try {
            stat = fs.statSync(filePath);
        } catch (e) {
            return;
        }

        if (stat.isDirectory()) {
            const children = scanDirectory(filePath);
            // Only add directory if it contains videos (recursively)
            // Or we can show all folders. Showing all for navigation is better.
            // But let's filter purely empty branches to keep UI clean if desired.
            // For now, let's keep it simple: show all dirs that return children.
            if (children.length > 0) {
                results.push({
                    name: file,
                    type: 'directory',
                    relativePath: path.relative(ROOT_DIR, filePath).replace(/\\/g, '/'),
                    children: children
                });
            }
        } else {
            const ext = path.extname(file).toLowerCase();
            if (VIDEO_EXTENSIONS.includes(ext)) {
                results.push({
                    name: file,
                    type: 'file',
                    relativePath: path.relative(ROOT_DIR, filePath).replace(/\\/g, '/'),
                    size: stat.size
                });
            }
        }
    });

    // Sort directories first, then files
    return results.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
    });
}

app.get('/api/files', (req, res) => {
    console.log('Scanning files...');
    try {
        const tree = scanDirectory(ROOT_DIR);
        res.json(tree);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to scan directory' });
    }
});

// Fallback for SPA (though we just use index.html)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n--- VIDEO SERVER STARTED ---`);
    console.log(`UI available at: http://localhost:${PORT}`);
    console.log(`Serving videos from: ${ROOT_DIR}`);
});
