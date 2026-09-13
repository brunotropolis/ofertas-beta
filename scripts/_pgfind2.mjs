import pg from "pg";
const PW="tCNbpiZ4O9qVfKX2nImcUFjylRMd", REF="qkherjtsvakmpkxebuwy";
const regions=["sa-east-1","us-east-1","us-east-2","us-west-1","us-west-2","ap-southeast-1","eu-central-1","eu-west-1","ca-central-1"];
const hosts=[];
for(const p of ["aws-0","aws-1"]) for(const r of regions) hosts.push([`${p}-${r}`,`${p}-${r}.pooler.supabase.com`]);
for(const [tag,host] of hosts){
  const c=new pg.Client({host,port:5432,user:"postgres."+REF,password:PW,database:"postgres",ssl:{rejectUnauthorized:false},connectionTimeoutMillis:5000});
  try{ await c.connect(); await c.query("select 1"); console.log("✅✅✅ CONECTOU:",tag,host); await c.end(); process.exit(0); }
  catch(e){ const msg=e.message.slice(0,30); if(!msg.includes("tenant")) console.log(tag,"→",msg); try{await c.end();}catch{} }
}
console.log("nenhum host funcionou");
