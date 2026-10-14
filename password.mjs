import {scrypt as rawScrypt,randomBytes,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(rawScrypt),options={N:32768,r:8,p:1,maxmem:67108864};
export async function hashPassword(password){
 if(typeof password!=='string'||password.length<12||password.length>128)throw Object.assign(new Error('Use a private password between 12 and 128 characters.'),{status:400});
 const salt=randomBytes(16).toString('hex');return {salt,password_hash:(await scrypt(password,salt,64,options)).toString('hex')};
}
export async function verifyPassword(password,credential){
 if(typeof password!=='string'||password.length<12||password.length>128||!credential||!/^[a-f0-9]{32}$/.test(credential.salt)||!/^[a-f0-9]{128}$/.test(credential.password_hash))return false;
 const actual=await scrypt(password,credential.salt,64,options);return timingSafeEqual(actual,Buffer.from(credential.password_hash,'hex'));
}
