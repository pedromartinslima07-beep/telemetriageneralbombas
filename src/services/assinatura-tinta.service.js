// Mede quanta TINTA tem uma assinatura (PNG em data URL, fundo transparente).
//
// ⚠️ POR QUE EXISTE (05/10/2026): "tem assinatura" era só `assinatura_b64 IS NOT
// NULL`, e um PNG transparente passa nessa conta. A OS-2026-0139 foi finalizada
// com um quadro 592×360 sem UM pixel de tinta, a 0069 com um ponto e a 0052 com
// um risco solto — e o PDF saiu com o quadro da assinatura vazio. A causa estava
// no app (o canvas reabria em branco achando que já tinha assinatura, e um toque
// gravava o branco por cima da verdadeira); isto aqui é a segunda trava, que
// vale também para APK antigo que não recebeu o conserto.
//
// O CORTE foi medido nas 110 O.S. finalizadas de produção, no mesmo dia: as três
// defeituosas ficam abaixo de 0,22% de tinta; a menor assinatura de verdade tem
// 0,80% e ocupa 40% do quadro. 0,3% e 15% deixam 2,6× de folga para baixo da
// menor real. A proporção não depende da densidade da tela: traço e quadro
// crescem juntos com o devicePixelRatio.
//
// ⚠️ O MESMO CORTE MORA NO APP (`_assinaturaTemTinta` em app/public/app.js).
// Mudou aqui, muda lá — senão o app aceita o que o servidor recusa.
const { PNG } = require("pngjs");

const TINTA_MIN_PCT = 0.3;   // % dos pixels do quadro com tinta
const EXTENSAO_MIN  = 0.15;  // maior lado do traço / lado do quadro
const ALFA_MIN      = 20;    // abaixo disso é antisserrilhado, não tinta

function medirTinta(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  let png;
  try {
    const b64 = dataUrl.replace(/^data:[^,]*,/, "");
    png = PNG.sync.read(Buffer.from(b64, "base64"));
  } catch {
    return null; // não é PNG legível
  }
  const { width: w, height: h, data } = png;
  let tinta = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > ALFA_MIN) {
        tinta++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const extensao = x1 < 0 ? 0 : Math.max((x1 - x0 + 1) / w, (y1 - y0 + 1) / h);
  return { largura: w, altura: h, tinta_pct: (tinta / (w * h)) * 100, extensao };
}

// true só quando há uma assinatura de verdade no quadro.
function assinaturaTemTinta(dataUrl) {
  const m = medirTinta(dataUrl);
  return !!m && m.tinta_pct >= TINTA_MIN_PCT && m.extensao >= EXTENSAO_MIN;
}

module.exports = { medirTinta, assinaturaTemTinta, TINTA_MIN_PCT, EXTENSAO_MIN };
