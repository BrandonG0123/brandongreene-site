import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.txt': 'text/plain; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.stl': 'model/stl',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
};

/** Serve dist/ the way a static host would, so checks run against real output. */
export function serveDist(root = 'dist', port = 4322) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(root, url);
    if (!path.resolve(file).startsWith(path.resolve(root))) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      const withHtml = file.endsWith('.html') ? file : `${file}.html`;
      if (fs.existsSync(withHtml)) file = withHtml;
      else {
        const notFound = path.join(root, '404.html');
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found');
        return;
      }
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, port })));
}

/** Every built HTML page, as site-root paths. */
export function builtPages(root = 'dist') {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.html')) {
        const rel = path.relative(root, full).replace(/index\.html$/, '').replace(/\.html$/, '');
        out.push('/' + rel.replace(/\/$/, ''));
      }
    }
  };
  walk(root);
  return [...new Set(out)].sort();
}
