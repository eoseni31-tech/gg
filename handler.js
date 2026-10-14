import {timingSafeEqual} from 'node:crypto';
import {handle} from '../lib/core.mjs';
import {database} from '../lib/database.mjs';
import {configuration,serve} from '../lib/runtime.mjs';
export default async function handler(req,res){
 try{
  const route=String(req.query?.route||'').replace(/^\/+/,''),config=configuration();
  if(route==='config'&&req.method==='GET'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.status(200).send('window.SG_CONFIG='+JSON.stringify({guestOrigin:process.env.GUEST_ORIGIN})+';');}
  if(!route||route==='handler'||route==='bootstrap')return res.status(404).json({error:'Not found.'});
  const headers=new Headers();for(const name of ['cookie','content-type','origin','x-csrf-token','sec-fetch-site']){const v=req.headers[name];if(typeof v==='string')headers.set(name,v);}
  let body;if(!['GET','HEAD'].includes(req.method)){body=typeof req.body==='string'?req.body:JSON.stringify(req.body??{});if(Buffer.byteLength(body)>16384)return res.status(413).json({error:'Submission is too large.'});}
  const request=new Request(config.origin+'/api/'+route,{method:req.method,headers,...(body?{body}:{})});
  let clientIp=String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();
  const proxySecret=String(req.headers['x-public-proxy-secret']||''),expected=process.env.PUBLIC_PROXY_SECRET;
  if(expected&&Buffer.byteLength(proxySecret)===Buffer.byteLength(expected)&&timingSafeEqual(Buffer.from(proxySecret),Buffer.from(expected)))clientIp=String(req.headers['x-public-client-ip']||clientIp).slice(0,100);
  const response=await serve(request,database(),{...config,clientIp},handle);
  response.headers.forEach((v,k)=>res.setHeader(k,v));return res.status(response.status).send(await response.text());
 }catch(e){console.error('Wedding API failed:',e.message);return res.status(503).json({error:'The wedding backend needs configuration. Follow START-HERE.md and verify the database setup.'});}
}
