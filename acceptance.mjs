import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {handle} from '../lib/core.mjs';
import {adapter} from '../lib/store.mjs';
import {proxyPublic} from '../../guest-site/api/handler.js';
test('Vercel package: real libSQL persistence, password login, shared guest submissions and wedding isolation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'vercel-wedding-')),url='file:'+join(dir,'wedding.db'),origin='https://couple.example.test';
 const password='Test-only couple password 123!',ownerCode='owner-test-code-123456789',ownerPassword='Test-only owner password 456!';
 const config={origin,codePepper:'test-only-pepper-with-at-least-32-characters',clientIp:'192.0.2.1'};
 execFileSync(process.execPath,['scripts/setup.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:'local-test',CODE_PEPPER:config.codePepper,COUPLE_PASSWORD:password,ADMIN_ACCESS_CODE:ownerCode,ADMIN_PASSWORD:ownerPassword},stdio:'pipe'});
 let client=createClient({url,intMode:'number'}),db=adapter(client),cookie='',csrf='';
 async function req(path,body,method='POST',extra={}){const r=await handle(new Request(origin+path,{method:body?method:'GET',headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(body?{Origin:origin,'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})}),db,null,config);return {r,d:await r.json()}}
 async function login(code,pass){const q=await req('/api/code-login',{code,password:pass});assert.equal(q.r.status,200);assert.ok(q.r.headers.get('set-cookie').includes('HttpOnly; Secure; SameSite=Strict'));cookie=q.r.headers.get('set-cookie').split(';')[0];csrf=q.d.csrf;return q}
 try{
  let q=await req('/api/me');assert.equal(q.r.status,401);
  q=await req('/api/code-login',{code:'OO1'});assert.equal(q.r.status,401);
  q=await req('/api/code-login',{code:'OO1',password:'An incorrect password 123!'});assert.equal(q.r.status,401);
  await login('OO1',password);q=await req('/api/me');assert.equal(q.d.is_admin,false);const wa=q.d.weddings[0].id;
  q=await req('/api/public/osato-osakpolor');assert.equal(q.d.payment_details.account_number,'9158718272');const event=q.d.events[0].id;
  const rsvp={request_key:crypto.randomUUID(),guest_name:'Test RSVP',attending:true,party:1,events:[event]};
  const send=async(url,options)=>handle(new Request(url,options),db,null,config);
  let response=await proxyPublic(new Request('https://guest.example.test/api/public/osato-osakpolor/rsvp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rsvp)}),origin,send);assert.equal(response.status,201);let saved=await response.json();const rid=saved.id,edit=saved.edit_token;
  q=await req('/api/public/osato-osakpolor/rsvp',rsvp);assert.equal(q.d.duplicate,true);
  const gift={request_key:crypto.randomUUID(),guest_name:'Test donor',amount:'2500.25',currency:'NGN',method:'bank_transfer',reference:'REFERENCE-TEST',status:'received'};
  response=await proxyPublic(new Request('https://guest.example.test/api/public/osato-osakpolor/gifts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(gift)}),origin,send);assert.equal(response.status,201);saved=await response.json();assert.equal(saved.status,'reported');const gid=saved.id;
  q=await req('/api/weddings/'+wa+'/rsvps');assert.ok(q.d.some(r=>r.id===rid));q=await req('/api/weddings/'+wa+'/gifts');assert.equal(q.d.find(g=>g.id===gid).reference,'REFERENCE-TEST');
  q=await req('/api/weddings/'+wa+'/summary');assert.equal(q.d.gifts[0].confirmed_minor,0);
  client.close();client=createClient({url,intMode:'number'});db=adapter(client);
  q=await req('/api/weddings/'+wa+'/rsvps');assert.ok(q.d.some(r=>r.id===rid),'Persistent records survive connection reopen');
  q=await req('/api/weddings/'+wa+'/gifts/'+gid,{status:'received'},'PATCH');assert.equal(q.r.status,200);
  q=await req('/api/weddings/'+wa+'/summary');assert.equal(q.d.gifts[0].confirmed_minor,250025);
  q=await req('/api/weddings/'+wa+'/audit');assert.ok(q.d.some(a=>a.action==='gift.updated'));
  q=await req('/api/public/osato-osakpolor/rsvp',{...rsvp,request_key:crypto.randomUUID(),edit_token:edit,attending:false,events:[]});assert.equal(q.r.status,201);
  q=await req('/api/weddings/'+wa+'/gifts/'+gid,{status:'void'},'PATCH',{'X-CSRF-Token':'invalid'});assert.equal(q.r.status,403);
  q=await req('/api/weddings/'+wa+'/gifts/'+gid,{status:'void'},'PATCH',{Origin:'https://attacker.example.test'});assert.equal(q.r.status,403);
  const cookieA=cookie,csrfA=csrf;
  await login(ownerCode,ownerPassword);q=await req('/api/admin/weddings',{title:'Second Couple',slug:'second-couple',max_party:1});assert.equal(q.r.status,201);const wb=q.d.id;
  q=await req('/api/admin/code',{wedding_id:wb,code:'second-couple-test-code-123',password:'Second couple password 789!'});assert.equal(q.r.status,200);
  await login('second-couple-test-code-123','Second couple password 789!');q=await req('/api/weddings/'+wb+'/rsvps');assert.equal(q.d.length,0);q=await req('/api/weddings/'+wa+'/gifts');assert.equal(q.r.status,404);q=await req('/api/weddings/'+wb+'/gifts/'+gid,{status:'received'},'PATCH');assert.equal(q.r.status,404);
  q=await req('/api/public/second-couple');assert.equal(q.d.payment_details,null);
  response=await proxyPublic(new Request('https://guest.example.test/api/me'),origin,send);assert.equal(response.status,404);
  cookie=cookieA;csrf=csrfA;q=await req('/api/logout',{});assert.equal(q.r.status,200);q=await req('/api/me');assert.equal(q.r.status,401);
  const credentials=await client.execute('SELECT salt,password_hash FROM password_credentials');assert.ok(credentials.rows.every(r=>r.password_hash.length===128&&!r.password_hash.includes('password')));
  execFileSync(process.execPath,['scripts/setup.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:'local-test',CODE_PEPPER:config.codePepper,COUPLE_PASSWORD:password},stdio:'pipe'});
  assert.equal((await client.execute('SELECT COUNT(*) n FROM rsvps')).rows[0].n,1,'Repeated setup preserves records');
  assert.ok(!readFileSync(new URL('../public/dashboard.js',import.meta.url),'utf8').includes('signin-with-chatgpt'));
 }finally{client.close();rmSync(dir,{recursive:true,force:true})}
});
