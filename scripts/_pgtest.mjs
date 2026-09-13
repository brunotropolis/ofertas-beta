import pg from "pg";
const PW="tCNbpiZ4O9qVfKX2nImcUFjylRMd";
const cfg={ host:"aws-0-us-west-2.pooler.supabase.com", port:5432, user:"postgres.qkherjtsvakmpkxebuwy", password:PW, database:"postgres", ssl:{rejectUnauthorized:false} };
const c=new pg.Client(cfg);
try{ await c.connect(); const r=await c.query("select current_database() db, now()"); console.log("CONECTOU ✅:",JSON.stringify(r.rows[0])); await c.end(); }
catch(e){ console.log("erro:",e.message.slice(0,120)); }
