export async function serve(request,db,config,handler){
 const path=new URL(request.url).pathname;
 if(path==='/api/bootstrap')return Response.json({error:'Not found.'},{status:404});
 return handler(request,db,null,config);
}
export function configuration(){
 const origin=process.env.APP_ORIGIN,guestOrigin=process.env.GUEST_ORIGIN,codePepper=process.env.CODE_PEPPER;
 if(!origin||!guestOrigin||!codePepper||codePepper.length<32)throw Error('Configure APP_ORIGIN, GUEST_ORIGIN and CODE_PEPPER (at least 32 characters).');
 for(const value of [origin,guestOrigin])if(new URL(value).origin!==value||!value.startsWith('https://'))throw Error('Origins must be https:// URLs without trailing slashes or paths.');
 return {origin,codePepper,publicOrigins:[guestOrigin]};
}
