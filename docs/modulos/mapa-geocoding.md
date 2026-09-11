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

Os tiles vêm do **Carto, basemap `dark_all`**, baixados **direto do CDN pelo
browser** de cada usuário:

```
https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png
```

Um único ponto de verdade por front: `_criarTileLayer` em `public/admin.js`
(mapa do dashboard, mini-mapa do cadastro e mapa da página Mapa) e
`camadaTiles` em `public/operador.js` (mapa do turno e do diálogo de despacho).
Os dois têm de andar juntos — o comentário longo mora no `admin.js`.

**Por que Carto e não `tile.openstreetmap.org`:** os servidores de tile do OSM
são mantidos por voluntários e a política de uso deles não cobre aplicação em
produção. Em 11/09/2026 o OSM bloqueou este app: **403 em toda tile**, cada uma
substituída por um cartaz *"Access blocked — App is not following the tile usage
policy"*. O mapa do operador virou um mosaico de aviso. Detalhe que atrapalha o
diagnóstico: o bloqueio é **por aplicação**, então a mesma URL responde 200 num
`curl` de fora. **Não voltar para o OSM.**

`dark_all` já é escuro de origem — por isso **não** leva mais a classe
`.map-tiles-dark` (o `invert()` daquela regra clareava uma tile já escura). A
regra foi removida de `admin.css` e `operador.css` junto.

Cliente Leaflet: `keepBuffer: 4`, `updateWhenIdle: false`, `updateInterval: 100`
(carrega durante o pan, sensação de fluidez) e reenvio de tile que falhou — o
Leaflet não repete o pedido sozinho, e tile perdida fica preta para sempre.

O proxy `GET /tiles/:z/:x/:y.png` (em `src/app.js`) **continua existindo** mas
não é mais o caminho do mapa: concentrar todas as tiles de todos os clientes num
IP só da Railway dava rate-limit. Direto do CDN, cada usuário gasta a própria
cota.

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
