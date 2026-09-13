import pg from "pg";
const PW="tCNbpiZ4O9qVfKX2nImcUFjylRMd", REF="qkherjtsvakmpkxebuwy";
const cands=[
  ["direct","db."+REF+".supabase.co",5432,"postgres"],
  ["sa-east-1","aws-0-sa-east-1.pooler.supabase.com",5432,"postgres."+REF],
  ["us-east-1","aws-0-us-east-1.pooler.supabase.com",5432,"postgres."+REF],
  ["us-east-2","aws-0-us-east-2.pooler.supabase.com",5432,"postgres."+REF],
  ["us-west-1","aws-0-us-west-1.pooler.supabase.com",5432,"postgres."+REF],
  ["us-west-2-6543","aws-0-us-west-2.pooler.supabase.com",6543,"postgres."+REF],
];
for(const [tag,host,port,user] of cands){
  const c=new pg.Client({host,port,user,password:PW,database:"postgres",ssl:{rejectUnauthorized:false},connectionTimeoutMillis:6000});
  try{ await c.connect(); const r=await c.query("select 1 ok"); console.log(tag,"→ CONECTOU ✅"); await c.end(); break; }
  catch(e){ console.log(tag,"→",e.message.slice(0,50)); try{await c.end();}catch{} }
}
