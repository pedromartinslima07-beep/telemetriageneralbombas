// Entrega das páginas HTML sem os comentários do código-fonte.
//
// Os `<!-- -->` deste projeto não são ruído: são onde moram as armadilhas
// ("o anel de foco em elemento chanfrado tem de ser inset", "este path não
// pode ser /cliente/orcamentos"), e o CLAUDE.md trata o comentário no código
// como a documentação de primeira classe do repo. Só que comentário em HTML
// **vai junto para o navegador** — o Pedro abriu o F12 em 25/08/2026 e leu
// tudo, inclusive raciocínio interno de produto e decisões de negócio.
//
// Por isso a limpeza é na ENTREGA, nunca no arquivo: o fonte continua
// comentado para quem trabalha nele, e o navegador recebe só a marcação.
// Não existe build neste projeto (escolha deliberada — ver CLAUDE.md), então
// o lugar disso é aqui, em tempo de request, com cache em memória.

const fs = require("fs");

const isProd = process.env.NODE_ENV === "production";

// { caminho: { mtimeMs, html } }
const _cache = new Map();

/**
 * Remove comentários HTML preservando o que está dentro de <script> e <style>.
 *
 * ⚠️ NÃO É UM REGEX GLOBAL EM `<!--.*?-->`, e a diferença importa: dentro de
 * um <script> a sequência `<!--` pode aparecer numa string ou num regex do
 * próprio JS, e um regex ingênuo comeria o código do meio para a frente. Por
 * isso o texto é percorrido em segmentos: bloco de script/style passa
 * intacto, e só o que está fora dele é limpo.
 *
 * ⚠️ Comentário condicional de IE (`<!--[if `) também sobrevive: ele é
 * marcação disfarçada de comentário, e apagá-lo mudaria o que a página faz.
 */
function tirarComentarios(html) {
  const baixo = html.toLowerCase();
  let saida = "";
  let i = 0;

  // ⚠️ UMA VARREDURA SÓ, E QUEM VEM PRIMEIRO NO TEXTO GANHA.
  //
  // A primeira versão disto procurava os blocos <script>/<style> antes de
  // olhar os comentários, e engoliu 136 KB do admin.html: a linha 15 tem um
  // comentário que MENCIONA `<script>` ("bumpe o ?v=N aqui E no <script> lá
  // embaixo"), o parser tomou aquilo por abertura de bloco e protegeu o
  // documento inteiro até o próximo `</script>`, 2.400 linhas adiante. 135
  // comentários saíram na entrega como se nada fosse.
  //
  // Comentário e bloco se aninham nos dois sentidos — `<script>` dentro de
  // comentário, `<!--` dentro de script — então a única leitura correta é
  // sequencial: acha os dois candidatos, trata o de menor índice, avança.
  while (i < html.length) {
    const comentario = baixo.indexOf("<!--", i);
    const script = baixo.indexOf("<script", i);
    const estilo = baixo.indexOf("<style", i);

    let bloco = -1;
    let fecha = "";
    if (script !== -1 && (estilo === -1 || script < estilo)) {
      bloco = script;
      fecha = "</script>";
    } else if (estilo !== -1) {
      bloco = estilo;
      fecha = "</style>";
    }

    // Nada mais a tratar: o resto vai inteiro.
    if (comentario === -1 && bloco === -1) {
      saida += html.slice(i);
      break;
    }

    // O comentário vem primeiro → remove (menos o condicional de IE).
    if (comentario !== -1 && (bloco === -1 || comentario < bloco)) {
      saida += html.slice(i, comentario);
      const fim = html.indexOf("-->", comentario);
      // Comentário sem fechamento: o resto do arquivo é comentário.
      if (fim === -1) break;
      if (baixo.startsWith("<!--[if", comentario)) {
        saida += html.slice(comentario, fim + 3); // marcação disfarçada, fica
      }
      i = fim + 3;
      continue;
    }

    // O bloco vem primeiro → passa intacto, comentários de dentro incluídos.
    saida += html.slice(i, bloco);
    const fimBloco = baixo.indexOf(fecha, bloco);
    const corte = fimBloco === -1 ? html.length : fimBloco + fecha.length;
    saida += html.slice(bloco, corte);
    i = corte;
  }

  // Sobra de linhas em branco onde os comentários estavam.
  return saida.replace(/\n[ \t]*(?=\n)/g, "").replace(/\n{3,}/g, "\n\n");
}

/**
 * Lê, limpa e guarda em memória. Em desenvolvimento o `mtime` invalida o
 * cache sozinho — sem isso, editar o HTML e dar F5 mostraria a versão antiga,
 * que é exatamente o tipo de confusão de cache que o CLAUDE.md documenta.
 */
function lerLimpo(caminho) {
  const mtimeMs = isProd ? 0 : fs.statSync(caminho).mtimeMs;
  const guardado = _cache.get(caminho);
  if (guardado && guardado.mtimeMs === mtimeMs) return guardado.html;

  const html = tirarComentarios(fs.readFileSync(caminho, "utf8"));
  _cache.set(caminho, { mtimeMs, html });
  return html;
}

/**
 * Substitui o `res.sendFile` das rotas de página.
 * Em caso de erro de leitura, responde o arquivo cru — uma página com
 * comentário é muito melhor que uma página que não abre.
 */
function enviarHtml(res, caminho) {
  try {
    res.type("html").send(lerLimpo(caminho));
  } catch (err) {
    console.error("Erro ao servir HTML limpo:", caminho, err.message);
    res.sendFile(caminho);
  }
}

module.exports = { enviarHtml, tirarComentarios };
