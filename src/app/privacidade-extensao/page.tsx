export const metadata = { title: "Privacidade · Extensão Buscador Geek" };

// Página pública exigida pela Chrome Web Store (18/Nov/2026). Linguagem simples: o que a extensão lê e pra onde manda.
export default function PrivacidadeExtensao() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-200 px-5 py-12">
      <article className="max-w-2xl mx-auto space-y-5 text-[15px] leading-relaxed">
        <h1 className="text-2xl font-semibold text-white">Política de privacidade da extensão Buscador Geek</h1>
        <p className="text-zinc-400 text-sm">Atualizada em 18 de novembro de 2026</p>

        <h2 className="text-lg font-semibold text-white pt-2">Para que serve</h2>
        <p>
          A extensão Buscador Geek é usada por quem opera o painel de ofertas <strong>app.buscadorgeek.com.br</strong>. Ela mantém em dia,
          no painel, o login da própria pessoa nos programas de afiliados (Mercado Livre e Amazon), para que o painel gere os links de
          afiliado dela sem o login vencer.
        </p>

        <h2 className="text-lg font-semibold text-white pt-2">O que ela lê</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Somente os cookies de login dos sites das lojas que a pessoa ligou no popup (hoje mercadolivre.com.br e amazon.com.br; outras lojas só depois que a pessoa clicar em &quot;Permitir&quot;).</li>
          <li>Ela <strong>não</strong> lê histórico, páginas visitadas, conteúdo de páginas, senhas digitadas, dados de pagamento nem outros sites.</li>
        </ul>

        <h2 className="text-lg font-semibold text-white pt-2">Para onde manda</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Só para o painel <strong>app.buscadorgeek.com.br</strong>, por conexão segura (HTTPS), quando o login da loja muda e numa conferência a cada 3 horas.</li>
          <li>No painel o login fica guardado <strong>criptografado</strong> e preso ao perfil da própria pessoa. É usado apenas para gerar links de afiliado e ler as vendas de afiliado dela.</li>
          <li>Nada é vendido, compartilhado com terceiros, usado para publicidade ou para análise de comportamento.</li>
        </ul>

        <h2 className="text-lg font-semibold text-white pt-2">Acesso e exclusão</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Cada Chrome se conecta com um acesso próprio, que a pessoa vê e desconecta a qualquer momento em app.buscadorgeek.com.br/extensao.</li>
          <li>Remover a extensão ou clicar em &quot;Desconectar&quot; no popup para de enviar na hora. Para apagar o login já guardado, escreva para o contato abaixo.</li>
        </ul>

        <h2 className="text-lg font-semibold text-white pt-2">Contato</h2>
        <p>assessoria@manualdorecemnascido.com.br</p>
      </article>
    </main>
  );
}
