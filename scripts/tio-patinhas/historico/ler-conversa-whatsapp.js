const fs=require('fs');const S=process.argv[2];
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const t=fs.readFileSync(S+'/zap_full/_chat.txt','utf8').replace(/[\u200e\u200f\u202a-\u202e]/g,'');
const re=/^\[(\d\d)\/(\d\d)\/(\d{4}), (\d\d):(\d\d):(\d\d)\] ([^:\n]+): /gm;
const idx=[];let m;while((m=re.exec(t)))idx.push({i:m.index,e:re.lastIndex,m});
const bad=/^(por\b|>|de r\$|custa|link|compre|🚚|✔|🏷|🎟|exclusivo|utilize|frete|\(|r\$|ative|🔗|válido|valida|confira|selecione|com um super|oferta para|esse preço|⏳|use o cupom|cupom:|resgate|aplique)/i;
const CATS=[
 ['Cupons e avisos',/^\d+ ?0?off|^r \d+ ?0?off|\d+ 0?off\b|mostrar mais|\bcupom\b|\bcupons\b|vagas abertas|grupo vip|liquida no ar|\d\.\d+ na natura/],
 ['Fraldas',/turma da monica baby|\bfraldas?\b(?!.*(pano|lixeira|bolsa|trocador))|\bpants\b|fralda calca|roupinha (xg|xxg|g|m|p)\b/],
 ['Lenços, algodão e troca',/lenco|toalhas? umedecid|algodao|cotonete|hastes flex|trocador|lixeira|lixo magico|fralda de pano|fraldas? de pano|pano de boca|cueiro/],
 ['Assaduras e pele',/assadura|bepantol|hipoglos|pomada|hidratante|oleo |locao|protetor solar|repelente|colonia|talco|creme (preventivo|para)/],
 ['Banho, higiene e saúde',/gel lavante|lavante|likluc|febre|kit de higiene|sabonete|shampoo|condicionador|banheira|toalha|roupao|banho|escova|pente|cortador|lixa de unha|aspirador nasal|nasal|termometro|nebulizador|inalador|soro|creme dental|pasta de dente/],
 ['Amamentação',/amamenta|bomba (de )?(tira|mama|extrat)|tira leite|extratora|absorvente (de |para )?sei|armazenar leite|leite materno|concha|bico de silicone|sutia|almofada de amament|poltrona/],
 ['Alimentação',/composto lacteo|leite em po|neslac|garrafinha|cadeira de refeicao|formula|aptanutri|aptamil|ninho|nan |nestogeno|mucilon|papinha|mamadeira|copo|babador|prato|talher|colher|kit alimentacao|introducao alimentar|cadeira de alimenta|cadeirao|cadeira de bebe para alimenta|garrafa|lancheira|esterilizador|aquecedor|pote/],
 ['Chupetas e mordedores',/chupeta|mordedor|massageador de gengiva|prendedor/],
 ['Passeio e carro',/para carro|espelho|tapa sol|janela de carro|assento infantil|cadeira litet|carrinho(?!.*(eletrico|controle|brinquedo|gira))|bebe conforto|cadeira (de |para )(carro|auto)|cadeirinha|travel system|canguru|sling|mochila|bolsa maternidade|bolsa |isofix|protetor (de )?(carro|banco)|guarda chuva/],
 ['Quarto, sono e segurança',/ruido branco|pulseira de seguranca|protetor para tomada|tela seguranca|joelheira|berco|moises|colchao|lencol|travesseiro|ninho redutor|redutor|saco de dormir|casulo|cobertor|manta|mosquiteiro|baba eletronica|monitor|luminaria|abajur|umidificador|tela respiravel|protetor de berco|comoda|guarda roupa|quarto completo|cercad|chiqueir|tapete(?!.*(banheiro|agua))|protetor de quina|trava|portao|cadeira (musical|de descanso|vibrat)|balanco/],
 ['Roupas e calçados',/body|bodies|macacao|conjunto|pijama|meia|meias|roup|vestido|calca|camiseta|blusa|moletom|sapat|tenis|sandalia|pantufa|touca|luva|enxoval|camisola|calcinha|cueca|legging|short|jaqueta|casaco|baby doll|pantalona|gestante/],
 ['Brinquedos e livros',/mesinha|atividades|caranguejo|barraca|boia|videogame|primeiros numeros|sofazinho|mini sofa|cadeira infantil|brinqued|boneca|carrinho|pelucia|livro|biblioteca|quebra cabeca|blocos|montessori|chocalho|mobile|andador|triciclo|bicicleta|bike|patinete|piscina|playground|jogo (da|de|educ)|lego|massinha|educativo|flashcards|tapete de agua|gira ginga|quadriciclo|motoca|bola|piano|pula pula|escorregador|colecao|sons d/],
 ['Casa e limpeza',/ar condicionado|nescafe|dolce gusto|sanduicheira|cortina|sabao|amaciante|lava roupas|detergente|omo |ariel|comfort|downy|desinfetante|multiuso|limpeza|mop|aspirador|air fryer|fritadeira|panela|liquidificador|ventilador|aquecedor|purificador|jogo de (tacas|toalhas|lencol|cama)|taca|organizador|cabide|papel higienico|esponja|vassoura|tapete de banheiro|ferro|micro ondas|geladeira|maquina de lavar|tv |smart|fone|celular|notebook/],
 ['Mamãe',/mamae|natura|perfume|maquiagem|cinta|absorvente|vitamina|suplemento|creme para estrias|estrias|depilador|secador|chapinha|luna|humor|ekos|naturé|nature/],
];
function cat(nome,body){const n=norm(nome);for(const [c,r] of CATS)if(r.test(n))return c;const b=norm(body).slice(0,200);for(const [c,r] of CATS.slice(1))if(r.test(b))return c;return 'Outros'}
const posts=idx.map((x,n)=>{const body=t.slice(x.e,n+1<idx.length?idx[n+1].i:t.length).trim();const [,d,mo,y,h]=x.m;
 const url=(body.match(/https?:\/\/\S+/g)||[]);const u=url.join(' ');if(!url.length)return null;
 const loja=/amzn\.|amazon|a\.co\//.test(u)?'Amazon':/meli\.la|mercadolivre|mercadolibre/.test(u)?'Mercado Livre':/shopee/.test(u)?'Shopee':/magalu|magazine|divulgador/.test(u)?'Magalu':/natura/.test(u)?'Natura':'Outra loja';
 const lines=body.split('\n').map(l=>l.trim()).filter(Boolean);let nome='';
 for(const l of lines){const c=l.replace(/[*_~]/g,'').replace(/^[^\p{L}\p{N}]+/u,'').replace(/[^\p{L}\p{N})]+$/u,'').trim();if(!c||bad.test(c)||bad.test(l)||/https?:/.test(l))continue;const letters=c.replace(/[^\p{L}]/gu,'');const up=letters.replace(/[^\p{Lu}]/gu,'').length/(letters.length||1);const words=c.split(/\s+/).length;if(up>0.8&&words<=7&&!/\d/.test(c))continue;if(/!{2,}|‼|😱|😍/.test(l)&&words<=7)continue;if(words<2)continue;nome=c;break}
 const pm=body.match(/por:?\s*\*?R\$\s*([\d.]+(?:,\d+)?)/i)||body.match(/R\$\s*([\d.]+(?:,\d+)?)/);const preco=pm?parseFloat(pm[1].replace(/\./g,'').replace(',','.')):null;
 return {mes:`${y}-${mo}`,dia:`${y}-${mo}-${d}`,hora:+h,loja,nome,preco,url:url[url.length-1].replace(/[)*_.,]+$/,''),cupom:/cupom/i.test(body),body};
}).filter(Boolean);
const pm={};for(const p of posts)pm[p.mes]=(pm[p.mes]||0)+1;console.log('posts por mes',JSON.stringify(pm));
const sel=posts.filter(p=>p.mes=='2026-04'||p.mes=='2026-07');
const g={};
for(const p of sel){if(!p.nome)p.nome='(sem nome) '+p.body.split('\n')[0].slice(0,50);p.cat=cat(p.nome,p.body);const key=p.mes+'|'+p.loja+'|'+norm(p.nome).split(' ').slice(0,8).join(' ');const o=g[key]=g[key]||{mes:p.mes,loja:p.loja,nome:p.nome,cat:p.cat,n:0,min:null,max:null,url:p.url,dias:[]};o.n++;if(p.preco!=null){o.min=o.min==null?p.preco:Math.min(o.min,p.preco);o.max=o.max==null?p.preco:Math.max(o.max,p.preco)}o.url=p.url;o.dias.push(p.dia.slice(8))}
const items=Object.values(g);
for(const mes of ['2026-04','2026-07']){const it=items.filter(i=>i.mes==mes);const ps=sel.filter(p=>p.mes==mes);const c={};for(const i of it){c[i.cat]=c[i.cat]||[0,0];c[i.cat][0]++;c[i.cat][1]+=i.n}const l={};for(const p of ps)l[p.loja]=(l[p.loja]||0)+1;
 console.log('\n##',mes,'posts',ps.length,'produtos',it.length,'dias',new Set(ps.map(p=>p.dia)).size,JSON.stringify(l));console.log(Object.entries(c).sort((a,b)=>b[1][1]-a[1][1]).map(([k,v])=>k+': '+v[0]+' prod / '+v[1]+' posts').join('\n'))}
console.log('\n-- amostra Outros');for(const i of items.filter(i=>i.cat=='Outros').sort((a,b)=>b.n-a.n).slice(0,70))console.log(i.n+'x',i.loja,'|',i.nome.slice(0,80));
fs.writeFileSync(S+'/full_items.json',JSON.stringify(items.map(({dias,...r})=>({...r,d:dias.length}))));
// ---- export historico completo
{
 const OUT='D:/CLAUDE/ofertas-beta/scripts/tio-patinhas/historico';fs.mkdirSync(OUT,{recursive:true});
 const rows=posts.map(p=>{let nome=(p.nome||'').replace(/^\(sem nome\)\s*/,'').replace(/[*_]/g,'').trim();let c=p.cat||cat(nome||p.body.split('\n')[0],p.body);if(/\d+\s*[%\$]\s*[0o]ff/i.test(nome)||/cupom/i.test(nome))c='Cupons e avisos';return {dia:p.dia,hora:p.hora,loja:p.loja,produto:nome,preco:p.preco,cupom:p.cupom,categoria:c,link:p.url}});
 fs.writeFileSync(OUT+'/posts-grupo5-2026.jsonl',rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
 const res={};
 for(const r of rows){const m=r.dia.slice(0,7);const o=res[m]=res[m]||{mes:m,posts:0,dias:new Set(),lojas:{},categorias:{},cupom:0,precos:[],prod:new Set(),h811:0,h17:0};o.posts++;o.dias.add(r.dia);o.lojas[r.loja]=(o.lojas[r.loja]||0)+1;o.categorias[r.categoria]=(o.categorias[r.categoria]||0)+1;if(r.cupom)o.cupom++;if(r.preco!=null)o.precos.push(r.preco);o.prod.add(r.loja+'|'+norm(r.produto).split(' ').slice(0,8).join(' '));if(r.hora>=8&&r.hora<11)o.h811++;if(r.hora>=17)o.h17++}
 const resumo=Object.values(res).map(o=>{const p=o.precos.sort((a,b)=>a-b);const pc=n=>Math.round(100*n/o.posts);return {mes:o.mes,posts:o.posts,dias_com_post:o.dias.size,primeiro_dia:[...o.dias].sort()[0],ultimo_dia:[...o.dias].sort().at(-1),posts_por_dia:+(o.posts/o.dias.size).toFixed(1),produtos_diferentes:o.prod.size,pct_loja:Object.fromEntries(Object.entries(o.lojas).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,pc(v)])),pct_cupom:pc(o.cupom),preco_mediano:p[Math.floor(p.length/2)],pct_acima_100:Math.round(100*p.filter(x=>x>=100).length/p.length),pct_8_11h:pc(o.h811),pct_apos_17h:pc(o.h17),posts_por_categoria:Object.fromEntries(Object.entries(o.categorias).sort((a,b)=>b[1]-a[1]))}});
 fs.writeFileSync(OUT+'/posts-resumo-mensal.json',JSON.stringify(resumo,null,1));
 console.log('\nEXPORT',rows.length,fs.statSync(OUT+'/posts-grupo5-2026.jsonl').size);
 for(const r of resumo)console.log(r.mes,r.posts,'p/dia',r.posts_por_dia,r.primeiro_dia.slice(8)+'-'+r.ultimo_dia.slice(8),JSON.stringify(r.pct_loja),'cupom',r.pct_cupom+'%','med',r.preco_mediano,'fralda',Math.round(100*(r.posts_por_categoria['Fraldas']||0)/r.posts)+'%');
}
