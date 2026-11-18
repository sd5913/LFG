import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.md':'text/markdown; charset=utf-8'};
const port=Number(process.env.PORT||5173);
http.createServer((req,res)=>{
  let url;
  try {url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  let f=path.resolve(root,'.'+(url==='/'?'/index.html':url));
  if(!f.startsWith(root+path.sep)&&f!==path.join(root,'index.html')){res.writeHead(403);res.end();return;}
  try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');const data=fs.readFileSync(f);res.writeHead(200,{'Content-Type':type[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`LFG Pipe Room ready → http://localhost:${port}`));
