// Assinaturas de mentira para os testes, mas com PIXELS de verdade.
//
// Desde 05/10/2026 "tem assinatura" é ter tinta no PNG (ver
// src/services/assinatura-tinta.service.js), e os testes antigos gravavam
// 'data:image/png;base64,iVBORw0KGgo=' — só o cabeçalho de um PNG, que nem
// decodifica. Daqui sai um quadro 592×360 (o canvas do app em tela de
// densidade 2), transparente, com o que se pedir desenhado em preto.
const { PNG } = require("pngjs");

function _quadro(desenhar) {
  const png = new PNG({ width: 592, height: 360 });
  png.data.fill(0); // transparente, como o toDataURL do canvas
  const pintar = (x, y) => {
    if (x < 0 || y < 0 || x >= 592 || y >= 360) return;
    const i = (y * 592 + x) * 4;
    png.data[i + 3] = 255; // preto opaco (RGB já é 0)
  };
  desenhar(pintar);
  return "data:image/png;base64," + PNG.sync.write(png).toString("base64");
}

// Um rabisco que atravessa o quadro: passa no corte com folga.
const ASSINATURA_OK = _quadro((pintar) => {
  for (let x = 60; x < 530; x++) {
    const y = Math.round(180 + 90 * Math.sin(x / 35));
    for (let dy = -3; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) pintar(x + dx, y + dy);
  }
});

// O quadro vazio da OS-2026-0139.
const ASSINATURA_VAZIA = _quadro(() => {});

// O ponto da OS-2026-0069: um toque com micro-movimento.
const ASSINATURA_PONTO = _quadro((pintar) => {
  for (let y = 162; y < 166; y++) for (let x = 302; x < 306; x++) pintar(x, y);
});

module.exports = { ASSINATURA_OK, ASSINATURA_VAZIA, ASSINATURA_PONTO };
