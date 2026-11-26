import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 5173);
const server = await createServer({ root, server: { port, strictPort: true } });
await server.listen();
server.printUrls();
