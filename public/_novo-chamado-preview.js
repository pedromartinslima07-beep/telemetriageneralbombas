// Ver o cabeçalho de `_novo-chamado-preview.html`.
//
// ⚠️ ARQUIVO SEPARADO POR CAUSA DA CSP, não por organização: o helmet usa
// `script-src 'self'` (sem `unsafe-inline`), então `<script>` embutido na
// página NÃO EXECUTA — e sem erro visível na tela, que é o que engana. Foi o
// que segurou esta prévia em "Carregando…" na primeira tentativa. Mesmo motivo
// de `_operador-preview.js` existir.
// Os prédios da prévia. ⚠️ `nome` é a RAZÃO SOCIAL e `nome_fantasia` é o nome
// da porta — a inversão que parece erro de digitação e não é (migration 044).
// Em produção 71 dos 86 cadastros têm os dois diferentes.
const PV_CONDOS = [
  { id: 1, nome: "ELVIRA FERRAZ EMPREENDIMENTOS IMOBILIARIOS LTDA", nome_fantasia: "Auri Faria Lima", bairro: "Itaim Bibi", cidade: "São Paulo" },
  { id: 2, nome: "CONDOMINIO EDIFICIO VILA MARIANA",                nome_fantasia: "Residencial Vila Mariana", bairro: "Vila Mariana", cidade: "São Paulo" },
  { id: 3, nome: "Edifício Mont Blanc",                             nome_fantasia: "",              bairro: "Moema",     cidade: "São Paulo" },
  { id: 4, nome: "SAO CAETANO PRIME LTDA",                          nome_fantasia: "São Caetano Prime", bairro: "Centro", cidade: "São Caetano do Sul" },
  { id: 5, nome: "EDIS CENTER COMERCIAL LTDA",                      nome_fantasia: "Édis Center",   bairro: "República", cidade: "São Paulo" },
  { id: 6, nome: "RESIDENCIAL AURORA SPE LTDA",                     nome_fantasia: "Aurora",        bairro: "Perdizes",  cidade: "São Paulo" },
  { id: 7, nome: "AURORA PARK ADMINISTRACAO LTDA",                  nome_fantasia: "Aurora Park",   bairro: "Pinheiros", cidade: "São Paulo" },
];

let pvOverlay = null;
let pvPicker  = null;

const $placar = document.getElementById("pvPlacar");
const $nota   = document.getElementById("pvNota");

function pvContar() {
  const n = document.querySelectorAll(".cbx-campo").length;
  $placar.textContent = "campos de busca: " + n + (n > 1 ? "  ← EMPILHOU" : "");
  $placar.classList.toggle("pv-ruim", n > 1);
  return n;
}

// ⚠️ O MESMO QUE O `_ncAbrir` DO `admin.js` FAZ com o picker — de propósito
// idêntico, inclusive chamar `montar` a CADA abertura sobre o mesmo elemento.
// É essa repetição que o bug dos 3 seletores explorava; uma prévia que
// montasse uma vez só não veria nada.
function pvAbrir() {
  if (!pvOverlay) return;
  pvPicker = window.CondoPicker && window.CondoPicker.montar({
    campo: "ncCondo",
    itens: PV_CONDOS,
    permiteVazio: true,
    rotuloVazio: "Sem condomínio",
    placeholder: "Buscar por nome, bairro ou cidade…",
  });
  if (pvPicker) pvPicker.limpar();
  pvOverlay.style.display = "flex";
  pvContar();
}

function pvFechar() {
  if (pvOverlay) pvOverlay.style.display = "none";
  pvContar();
}

(async () => {
  try {
    const r = await fetch("/admin/painel", { headers: { "Cache-Control": "no-cache" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    const modal = doc.getElementById("novoChamadoOverlay");
    if (!modal) throw new Error("#novoChamadoOverlay não existe mais no admin.html");
    document.body.appendChild(document.importNode(modal, true));
    pvOverlay = document.getElementById("novoChamadoOverlay");

    // Os botões de fechar do próprio modal, para o ciclo ser o de verdade.
    ["btnFecharNovoChamado", "btnCancelarNovoChamado"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener("click", pvFechar);
    });

    $nota.innerHTML =
      "Modal recortado do <code>/admin/painel</code> servido agora — markup e " +
      "CSS são os de produção. <b>Salvar não grava nada</b> aqui (o handler mora no " +
      "<code>admin.js</code>, que não é carregado). Os prédios são uma lista fixa " +
      "de 7, escolhida pelos casos difíceis: razão social diferente do nome de porta, " +
      "acento, e dois “Aurora” que só o bairro separa.";
    pvContar();
  } catch (e) {
    $nota.textContent = "Não deu para carregar o modal: " + e.message;
  }
})();

document.getElementById("pvAbrir").addEventListener("click", pvAbrir);
document.getElementById("pvFechar").addEventListener("click", pvFechar);
document.getElementById("pvCiclo").addEventListener("click", () => {
  for (let i = 0; i < 3; i++) { pvAbrir(); pvFechar(); }
  pvAbrir();
});
