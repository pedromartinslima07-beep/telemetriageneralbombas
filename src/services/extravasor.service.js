// Detecção de extravasamento pelo nível — a regra, sem banco.
// docs/modulos/telemetria.md, seção "Extravasamento". Migration 106.
//
// ⚠️ EXTRAVASAMENTO NÃO É "NÍVEL ACIMA DE 100%". Quando a água extravasa o
// nível para na altura do ladrão e o excesso sai pelo cano. Um reservatório
// cheio com a boia fechada também fica parado no alto, poucos centímetros
// abaixo — e o ruído da sonda (±1,7% medido, ~3 cm numa caixa de 2 m) é do
// mesmo tamanho dessa folga. Daí as três peças:
//
//   1. A altura do LADRÃO por reservatório (`altura_extravasor_m`), em metros,
//      e não uma porcentagem global.
//   2. TEMPO: o alerta só sai com o nível no ladrão por N minutos seguidos.
//   3. HISTERESE para sair: entrar vale a partir de `tolerancia` cm abaixo do
//      ladrão; sair exige descer mais `histerese` cm. Sem ela, uma leitura
//      ruidosa para baixo zeraria o relógio no meio de um extravasamento real.
//
// E a regra mais forte, que não depende da precisão da sonda: BOMBA LIGADA
// COM O NÍVEL NO LADRÃO. Na caixa superior a boia elétrica deveria ter
// desligado o recalque antes de a água chegar ali; se a bomba continua
// girando, a água está indo para o extravasor. Por isso ela tem prazo menor.
//
// A cisterna enchida pela rua (boia mecânica, sem bomba) só tem a regra do
// nível — é o caso em que o sensor no próprio ladrão (etapa 2, hardware) é
// que dá certeza.

// Leitura que chega depois de um buraco maior que isto não continua o
// relógio de antes: o device ficou fora e não sabemos o que houve no meio.
const LACUNA_MAX_MS = 5 * 60 * 1000;

const PADRAO = {
  minutos: 10,        // telemetria.extravasor_minutos
  bombaMinutos: 3,    // telemetria.extravasor_bomba_minutos
  toleranciaCm: 2,    // telemetria.extravasor_tolerancia_cm
  histereseCm: 3,     // telemetria.extravasor_histerese_cm
};

// Altura da água em metros, SEM o teto de 100% que `calcularNivelPct` aplica —
// com o ladrão na altura total, o teto esconderia justamente o que procuramos.
function alturaAguaM(adcRaw, { adc_zero, adc_por_metro }) {
  return (Number(adcRaw) - Number(adc_zero)) / Number(adc_por_metro);
}

/**
 * Decide o estado do extravasamento para UMA leitura.
 *
 * Entrada:
 *   alturaAgua   metros (de alturaAguaM)
 *   ladrao       metros (`altura_extravasor_m`); null = detecção desligada
 *   bombaLigada  true | false | null
 *   desde        Date|null — `extravasor_desde` gravado
 *   bombaDesde   Date|null — `extravasor_bomba_desde` gravado
 *   lastSeen     Date|null — última leitura recebida ANTES desta
 *   agora        Date
 *   cfg          { minutos, bombaMinutos, toleranciaCm, histereseCm }
 *
 * Saída:
 *   { desde, bombaDesde, noLadrao, disparo }
 *   disparo: null | "nivel" | "bomba" — "bomba" ganha quando os dois valem.
 */
function avaliarExtravasor({ alturaAgua, ladrao, bombaLigada, desde, bombaDesde, lastSeen, agora, cfg = {} }) {
  const c = { ...PADRAO, ...cfg };
  const t = agora instanceof Date ? agora : new Date(agora);

  if (ladrao == null || !Number.isFinite(Number(ladrao)) || !Number.isFinite(alturaAgua)) {
    return { desde: null, bombaDesde: null, noLadrao: false, disparo: null };
  }

  // Buraco nas leituras: o relógio de antes não vale mais.
  const lacuna = !lastSeen || (t - new Date(lastSeen)) > LACUNA_MAX_MS;
  let d  = lacuna ? null : (desde ? new Date(desde) : null);
  let db = lacuna ? null : (bombaDesde ? new Date(bombaDesde) : null);

  const entra = Number(ladrao) - c.toleranciaCm / 100;
  const sai   = entra - c.histereseCm / 100;

  let noLadrao;
  if (alturaAgua >= entra)    noLadrao = true;
  else if (alturaAgua < sai)  noLadrao = false;
  else                        noLadrao = d != null; // faixa morta: mantém o que era

  d  = noLadrao ? (d || t) : null;
  db = noLadrao && bombaLigada === true ? (db || t) : null;

  const min = (x) => (t - x) / 60000;
  const disparo = db && min(db) >= c.bombaMinutos ? "bomba"
                : d  && min(d)  >= c.minutos      ? "nivel"
                : null;

  return { desde: d, bombaDesde: db, noLadrao, disparo };
}

module.exports = { avaliarExtravasor, alturaAguaM, PADRAO, LACUNA_MAX_MS };
