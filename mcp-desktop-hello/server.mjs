#!/usr/bin/env node
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
const html=readFileSync(new URL("./app.html",import.meta.url),"utf8");
const uri={global:"ui://desktop-hello/global",thread:"ui://desktop-hello/thread"};
const annotation={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
const tool=(name,title,description,surface)=>({
  name,title,description,
  inputSchema:{type:"object",properties:{},additionalProperties:false},
  annotations:annotation,
  _meta:{ui:{resourceUri:uri[surface],visibility:["app","model"]},
    "openai/ui":{entrypoints:[{type:surface}]}}
});
const tools=[
 tool("hello.open","Hello World","Open Hello World from the sidebar.","global"),
 tool("hello.panel","Hello panel","Open Hello World beside this conversation.","thread")
];
const resources=Object.entries(uri).map(([name,value])=>({
 uri:value,name:"Hello World "+name,title:"Hello World "+name,mimeType:"text/html;profile=mcp-app"
}));
function respond(id,result){process.stdout.write(JSON.stringify({jsonrpc:"2.0",id,result})+"\n");}
function error(id,code,message){process.stdout.write(JSON.stringify({jsonrpc:"2.0",id,error:{code,message}})+"\n");}
function handle(m){
 if(!m||m.jsonrpc!=="2.0"||typeof m.method!=="string"||!("id" in m))return;
 const {id,method}=m,p=m.params??{};
 switch(method){
  case "initialize":
   return respond(id,{protocolVersion:"2025-11-25",
    capabilities:{tools:{listChanged:false},resources:{listChanged:false}},
    serverInfo:{name:"desktop-hello",title:"Desktop Hello World",version:"0.1.0"}});
  case "ping":return respond(id,{});
  case "tools/list":return respond(id,{tools});
  case "tools/call":
   if(!tools.some(t=>t.name===p.name))return error(id,-32602,"Unknown tool");
   return respond(id,{content:[{type:"text",text:"Hello World! MCP Extensions desktop test."}],
    structuredContent:{greeting:"Hello World!",source:p.name},isError:false});
  case "resources/list":return respond(id,{resources});
  case "resources/read":
   if(!Object.values(uri).includes(p.uri))return error(id,-32602,"Unknown resource");
   return respond(id,{contents:[{uri:p.uri,mimeType:"text/html;profile=mcp-app",text:html,
    _meta:{"openai/ui":{preferredDisplayMode:p.uri===uri.global?"fullscreen":"inline",
     availableDisplayModes:["inline","fullscreen"]},ui:{prefersBorder:true}}}]});
  default:return error(id,-32601,"Method not found: "+method);
 }
}
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 if(!line.trim())continue;
 try{handle(JSON.parse(line));}catch(e){console.error("MCP parse error",e);}
}
