// Tiny zero-dependency localhost-only development server.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const port = Number(process.env.PORT ?? 5173);
http.createServer(async (request,response)=>{
  let local;
  try {
    const raw = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    local = path.resolve(root, '.' + raw, raw.endsWith('/') ? 'index.html' : '');
    if (!local.startsWith(root + path.sep) && local !== path.join(root,'index.html')) throw new Error('Forbidden');
    const info = await stat(local); if(!info.isFile()) throw new Error('Not a file');
    response.writeHead(200,{'Content-Type':types[path.extname(local)] || 'application/octet-stream','Cache-Control':'no-cache'});
    response.end(await readFile(local));
  } catch (error) {response.writeHead(404);response.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Museum Heist demo: http://localhost:${port}`));
