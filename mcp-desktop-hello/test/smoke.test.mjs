import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
test("MCP stdio protocol + UI metadata",{timeout:10000},async()=>{
 const child=spawn(process.execPath,["server.mjs"],{cwd:root,stdio:["pipe","pipe","pipe"]});
 let buffer="",err="",counter=0;
 const pending=new Map();
 child.stderr.on("data",d=>{err+=d.toString()});
 child.stdout.on("data",d=>{
  buffer+=d.toString();
  for(let n=buffer.indexOf("\n");n>=0;n=buffer.indexOf("\n")){
   const m=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);
   pending.get(m.id)?.(m);pending.delete(m.id);
  }
 });
 const request=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++counter;
  const timer=setTimeout(()=>reject(new Error("Timeout: "+method+" "+err)),5000);
  pending.set(id,msg=>{clearTimeout(timer);resolve(msg)});
  child.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");
 });
 try{
  const init=await request("initialize",{protocolVersion:"2025-11-25",capabilities:{},clientInfo:{name:"test",version:"1"}});
  assert.equal(init.result.serverInfo.name,"desktop-hello");
  assert.equal(init.result.protocolVersion,"2025-11-25");
  child.stdin.write(JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"})+"\n");
  const list=await request("tools/list");
  assert.deepEqual(list.result.tools.map(t=>t.name),["hello.open","hello.panel"]);
  assert.deepEqual(list.result.tools[0]._meta["openai/ui"].entrypoints,[{type:"global"}]);
  assert.deepEqual(list.result.tools[1]._meta["openai/ui"].entrypoints,[{type:"thread"}]);
  const resources=await request("resources/list");
  assert.equal(resources.result.resources.length,2);
  for(const item of resources.result.resources){
   const read=await request("resources/read",{uri:item.uri});
   assert.equal(read.result.contents[0].mimeType,"text/html;profile=mcp-app");
   assert.match(read.result.contents[0].text,/Hello World!/);
  }
  assert.equal((await request("tools/call",{name:"hello.open",arguments:{}})).result.structuredContent.greeting,"Hello World!");
  assert.equal((await request("tools/call",{name:"unknown",arguments:{}})).error.code,-32602);
  assert.equal(err,"");
 }finally{child.stdin.end();child.kill();}
});
test("portable plugin wiring",()=>{
 const plugin=JSON.parse(readFileSync(resolve(root,"plugin.json"),"utf8"));
 const mcp=JSON.parse(readFileSync(resolve(root,"mcp.json"),"utf8"));
 assert.equal(plugin.name,"desktop-hello-world");
 assert.equal(mcp.mcpServers["desktop-hello"].type,"stdio");
 assert.equal(mcp.mcpServers["desktop-hello"].command,"node");
 assert.match(mcp.mcpServers["desktop-hello"].args[0],/server\.mjs$/);
});
