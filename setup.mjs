import {createClient} from '@libsql/client';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {hashPassword} from '../lib/password.mjs';
const e=process.env;
if(!e.TURSO_DATABASE_URL||!e.TURSO_AUTH_TOKEN||!e.CODE_PEPPER||e.CODE_PEPPER.length<32||!e.COUPLE_PASSWORD)throw Error('Set TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, CODE_PEPPER (32+ characters), and COUPLE_PASSWORD (12+ characters) in .env.local first.');
if((e.ADMIN_ACCESS_CODE&&!e.ADMIN_PASSWORD)||(!e.ADMIN_ACCESS_CODE&&e.ADMIN_PASSWORD))throw Error('Provide both ADMIN_ACCESS_CODE and ADMIN_PASSWORD, or omit both.');
if(e.ADMIN_ACCESS_CODE&&e.ADMIN_ACCESS_CODE.length<16)throw Error('ADMIN_ACCESS_CODE must contain at least 16 characters.');
const initial=await hashPassword(e.COUPLE_PASSWORD),admin=e.ADMIN_PASSWORD?await hashPassword(e.ADMIN_PASSWORD):null;
const client=createClient({url:e.TURSO_DATABASE_URL,authToken:e.TURSO_AUTH_TOKEN,intMode:'number'});
const hash=code=>createHash('sha256').update(e.CODE_PEPPER+':'+code).digest('hex');
try{
 await client.execute('CREATE TABLE IF NOT EXISTS vercel_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)');
 const directory=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort()){
  if((await client.execute({sql:'SELECT name FROM vercel_migrations WHERE name=?',args:[name]})).rows.length)continue;
  const statements=readFileSync(new URL(name,directory),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
  await client.batch([...statements,{sql:'INSERT INTO vercel_migrations VALUES(?,?)',args:[name,new Date().toISOString()]}],'write');
 }
 if(!(await client.execute("SELECT id FROM weddings WHERE slug='osato-osakpolor'")).rows.length){
  const now=new Date().toISOString(),wid=randomUUID(),email=e.COUPLE_EMAIL||'couple@private.invalid';
  await client.batch([
   {sql:'INSERT INTO couples VALUES(?,?,?)',args:['pending-platform-owner',email,now]},
   {sql:'INSERT INTO couples VALUES(?,?,?)',args:['platform-admin',e.ADMIN_EMAIL||email,now]},
   {sql:'INSERT INTO weddings VALUES(?,?,?,?,?,?,?)',args:[wid,'pending-platform-owner','osato-osakpolor','Osato & Osakpolor',2,'active',now]},
   {sql:'INSERT INTO events VALUES(?,?,?,?)',args:[randomUUID(),wid,'Traditional wedding','2027-03-20T14:00']},
   {sql:'INSERT INTO events VALUES(?,?,?,?)',args:[randomUUID(),wid,'White wedding','2027-03-21T11:00']},
   {sql:'INSERT INTO access_codes VALUES(?,?,?)',args:[hash('OO1'),'pending-platform-owner',now]},
   {sql:'INSERT INTO access_codes VALUES(?,?,?)',args:[hash(e.ADMIN_ACCESS_CODE||randomBytes(32).toString('hex')),'platform-admin',now]},
   {sql:'INSERT INTO password_credentials VALUES(?,?,?)',args:['pending-platform-owner',initial.salt,initial.password_hash]},
   ...(admin?[{sql:'INSERT INTO password_credentials VALUES(?,?,?)',args:['platform-admin',admin.salt,admin.password_hash]}]:[])
  ],'write');
 }
 console.log('Database schema ready. Initial wedding access code: OO1. Use the private password you configured. Existing records and credentials were preserved.');
}finally{client.close();}
