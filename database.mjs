import {createClient} from '@libsql/client';
import {adapter} from './store.mjs';
let db;
export function database(){
 if(db)return db;
 const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN;
 if(!url||!authToken||!/^libsql:\/\/|^https:\/\//.test(url))throw Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for your persistent remote database.');
 db=adapter(createClient({url,authToken,intMode:'number'}));return db;
}
