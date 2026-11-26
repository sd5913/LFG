import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'text/javascript;charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const port=Number(process.env.PORT||5180);
http.createServer(async(req,res)=>{try{const rel=new URL(req.url,'http://localhost').pathname.replace(/^\//,'')||'index.html';if(rel==='src/game-locale.js'){const data=await readFile(new URL('../src/game-locale.js',import.meta.url));res.writeHead(200,{'Content-Type':mime['.js']});return res.end(data)}const file=path.resolve(root,decodeURIComponent(rel));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);return res.end()}if(!(await stat(file)).isFile())throw Error();res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(await readFile(file))}catch{res.writeHead(404);res.end('Not found')}}).listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}`));
