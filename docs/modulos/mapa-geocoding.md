---
tags:
  - projeto
  - fluxo
aliases:
  - Mapa
  - Geocoding
  - Tiles
---
# Fluxo: Mapa, Geocoding e Tiles

Como o sistema posiciona condomínios no mapa e renderiza os tiles.

## Coordenadas do condomínio

`condominios.lat`/`lng` (NUMERIC 9,6) + `cep` + endereço. Preenchidos no
cadastro/edição com **geocoding híbrido** (frontend) e endpoints proxy
(backend).

### Geocoding direto (CEP / endereço → coordenadas)

Fontes em ordem de preferência, paralelizadas em `buscarEnderecoPorCep`:
1. **ViaCEP** — texto granular do endereço (logradouro, bairro, cidade, UF).
2. **AwesomeAPI** — lat/lng em nível de rua; é a fonte preferida de coordenada.
3. **BrasilAPI** — `location.coordinates`, **só quando o `service` da resposta
   não estiver na lista de providers sem coordenada real** (ver abaixo).
4. **Nominatim (OSM)** — fallback final, via proxy do backend.

> ⚠️ **BrasilAPI: coordenada de município disfarçada de coordenada de CEP.**
> A resposta de `/api/cep/v2` traz o campo `service` com o provider que a
> atendeu. Quando o provider é `open-cep`, o `location.coordinates` é o
> **centroide do município**, não do CEP: todo endereço de São Paulo volta como
> `-23.5475, -46.63611` (a Sé) e todo do Rio como `-22.90642, -43.18223`. Como
> a BrasilAPI era a primeira da fila, o pino de qualquer condomínio caía no
> centro da cidade. O filtro vive em `_coordsDeCep` (`public/admin.js`), com a
> whitelist negativa `_CEP_SERVICES_SEM_COORD_REAL`. Ao ver pino no centro da
> cidade de novo, **confira o `service` da BrasilAPI antes de suspeitar do
> código** — e adicione o provider novo a essa lista.

`_coordsDeCep(brasilData, awesomeData)` é a função única que escolhe a
coordenada; os dois caminhos que geocodificam por CEP (busca por CEP e
auto-preenchimento por CNPJ) passam por ela — não duplicar a escolha.

Busca por endereço (`buscarCoordenadasPorEndereco`) tenta progressivamente:
`endereço+CEP` → `endereço` → `CEP+cidade` → `bairro` → `cidade`. Validação
estrita por cidade (`_resultadoNaCidade`) e por prefixo de CEP (`_resultadoNoCep`)
descarta ruas homônimas em bairros/cidades errados.

### Endpoints proxy (backend)

- `GET /admin/geocode?q=...` — proxy do Nominatim `/search`.
- `GET /admin/reverse-geocode?lat=&lon=` — proxy do `/reverse` (zoom 18).

⚠️ **Enquadramento inicial: mediana + zoom fixo, nunca `fitBounds`.** Vale para
o mapa do dashboard e para a tela de Mapa (unificadas em 26/08/2026, via
`_mpEnquadrar`). `fitBounds` enquadra o retângulo de todos os pinos, e o
retângulo é refém do mais distante: um condomínio em Bragança faz o mapa abrir
em zoom 9, com os outros 79 empilhados. `MC_ZOOM_INICIAL = 11` com centro em
`_mcCentroMediano` foi medido no painel real — pega 79 dos 80 (zoom 10 pegava
71; zoom 12, só 50).

Ambos com **User-Agent próprio e fila de 1 req/s** (respeitando o ToS do
Nominatim). O frontend (ViaCEP/BrasilAPI/AwesomeAPI) é liberado no `connect-src`
da CSP (Helmet).

### Mini-mapa de cadastro

Leaflet (~280px) com pino arrastável. Arrastar dispara **reverse geocode** e
**sempre sobrescreve** endereço/bairro/cidade/UF/CEP com o retorno do Nominatim
(campo vazio do reverse mantém o atual). Race protection por sequência de
prefixo descarta respostas obsoletas em arrastos rápidos.

## Renderização do mapa (tiles)

Os tiles vêm do **Esri World Topo Map**, baixados **direto pelo browser** de
cada usuário:

```
https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}
```

Um único ponto de verdade por front: `_criarTileLayer` em `public/admin.js`
(mapa do dashboard, mini-mapa do cadastro e mapa da página Mapa) e
`camadaTiles` em `public/operador.js` (mapa do turno e do diálogo de despacho).
Os dois têm de andar juntos — o comentário longo mora no `admin.js`.

### Três armadilhas desta URL

1. **A ordem é `{z}/{y}/{x}`** — y **antes** de x, convenção da Esri, o
   contrário de todo mundo. Trocar os dois **não dá erro**: devolve uma tile
   válida do lugar errado, e o mapa abre num pedaço aleatório do planeta.
2. **O teto real é o zoom 19.** Dali em diante a Esri responde **200** com uma
   imagem cinza escrita *"Map data not yet available"* — sempre **2521 bytes**,
   que é como se reconhece. Não é erro, então nada no código percebe. O
   `maxZoom: 19` é o que impede o Leaflet de chegar lá.
3. **A CSP decide se o mapa aparece.** `img-src` em `src/app.js` lista o host
   do provedor; fora dela o browser bloqueia sem erro no lugar certo — mapa
   cinza, e a queixa aparece no console como violação de CSP, não como falha de
   rede. Trocar de provedor = trocar a CSP junto.

### Por que não os outros

| Provedor | Situação |
|---|---|
| `tile.openstreetmap.org` | **bloqueou o app em 11/09/2026** — 403 em toda tile, com o cartaz "App is not following the tile usage policy". Servidores de voluntários; a política não cobre app em produção. **Não voltar.** |
| Carto (`dark_all`, `voyager`, `light_all`) | hoje exige chave. Sem chave não recusa: serve o mapa com **"API KEY REQUIRED" carimbado na diagonal**. Volta a ser opção no dia em que houver conta. |
| Esri Canvas (cinza claro/escuro) | o mais bonito no painel, mas **para no zoom 16** — o cadastro precisa da porta do prédio. |
| Esri World Street Map | funciona até 19, mas é bege e laranja: o vermelho das rodovias briga com o vermelho do pino crítico. |
| Esri World Imagery (satélite) | funciona até 19; pesado para o painel, mas seria o melhor no mini-mapa do cadastro. Não adotado (um estilo só, por ora). |

### O basemap é claro; o mapa é escuro

O Topo é um basemap **claro**, e no painel ele aparece **escuro**. Quem faz a
travessia é o CSS: `.map-tiles-dark` (em `admin.css` e `operador.css`), ligada
pela `className` da camada nos dois fronts.

```css
filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
```

O `hue-rotate(180deg)` é o que separa isso de um negativo fotográfico: sozinho,
o `invert` joga o verde dos parques em rosa e a água em laranja; a rotação de
matiz devolve cada cor à família original, já escura.

**Os pinos não são afetados** — o filtro está no pane das tiles, e marcadores
vivem no `.leaflet-marker-pane`, irmão dele.

Por que não um basemap escuro de origem: o Esri Dark Gray, comparado em tela
com o Topo invertido, é cinza-médio e sem detalhe — e para no zoom 16. O
caminho mais longo dá o mapa mais bonito e chega ao 19.

⚠️ Quem trocar o basemap decide também o que fazer com esse filtro: um basemap
já escuro passando por ele volta a ficar claro. Foi o que aconteceu na troca
para o Carto `dark_all`, no mesmo dia.

O `background` do `.leaflet-container` fica escuro (`#0d1325`) porque a tile
também chega escura: é o que se vê enquanto ela não chegou.

O crédito é curto de propósito (`© Esri · © OpenStreetMap`): o card do mapa no
painel do operador tem ~350px, e o texto longo quebrava em duas linhas, tapando
o canto do mapa.

Cliente Leaflet: `keepBuffer: 4`, `updateWhenIdle: false`, `updateInterval: 100`
(carrega durante o pan, sensação de fluidez) e reenvio de tile que falhou — o
Leaflet não repete o pedido sozinho, e tile perdida fica em branco para sempre.

O proxy `GET /tiles/:z/:x/:y.png` (em `src/app.js`) **continua existindo** mas
não é o caminho do mapa: concentrar todas as tiles de todos os clientes num IP
só da Railway dava rate-limit. Direto do provedor, cada usuário gasta a própria
cota. Ele volta a fazer sentido no dia em que houver uma chave de API a
esconder do front.

> **Sem markercluster** — decisão consciente (ver
> [`../../memory-bank/decisions.md`](../../memory-bank/decisions.md)).

## Classificação por zona de SP

A página Mapa agrupa condomínios por zona. A divisão oficial de SP **não é
simétrica** (a Zona Sul cobre todo o sudoeste — Capão Redondo, Campo Limpo,
M'Boi Mirim), então quadrante puro lat/lng errava. `_mpZonaPara` usa um mapa de
~80 bairros conhecidos → zona oficial (com normalização de acentos), com
fallback geográfico (ex.: > 8 km ao sul = Zona Sul).

## Onde os pinos aparecem

- **Dashboard (Mission Control):** Leaflet singleton (`_mcMap`/`_mcMarkers`
  reusados entre polls) plotando cada condomínio; cor por status (OK/alerta/
  crítico/offline); clique abre o drawer.
- **Seção Mapa:** mapa grande + painel lateral com tabs (visão geral,
  reservatórios, bombas, alertas, chamados) e KPIs. `GET /admin/status` já
  retorna `endereco/bairro/cidade/uf/cep/lat/lng` para plotar sem chamada extra.
