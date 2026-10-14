export function adapter(client){
 const result=r=>({success:true,results:Array.from(r.rows||[],row=>({...row})),meta:{changes:Number(r.rowsAffected||0)}});
 return {prepare(sql){let args=[];return {bind(...v){args=v;return this},get statement(){return {sql,args}},async first(){const r=await client.execute({sql,args});return r.rows[0]?{...r.rows[0]}:null},async all(){return result(await client.execute({sql,args}))},async run(){return result(await client.execute({sql,args}))}}},async batch(statements){return (await client.batch(statements.map(s=>s.statement),'write')).map(result)}};
}
