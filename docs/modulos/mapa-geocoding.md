# Fluxo: Mapa, Geocoding e Tiles

Como o sistema posiciona condomínios no mapa e renderiza os tiles.

## Coordenadas do condomínio

`condominios.lat`/`lng` (NUMERIC 9,6) + `cep` + endereço. Preenchidos no
cadastro/edição com **geocoding híbrido** (frontend) e endpoints proxy
(backend).

### Geocoding direto (CEP / endereço → coordenadas)

Fontes em ordem de preferência, paralelizadas em `buscarEnderecoPorCep`:
1. **ViaCEP** — texto granular do endereço (logradouro, bairro, cidade, UF).
2. **BrasilAPI** — `location.coordinates` quando disponível.
3. **AwesomeAPI** — lat/lng (cobre CEPs urbanos que a BrasilAPI deixa sem coord).
4. **Nominatim (OSM)** — fallback final, via proxy do backend.

Busca por endereço (`buscarCoordenadasPorEndereco`) tenta progressivamente:
`endereço+CEP` → `endereço` → `CEP+cidade` → `bairro` → `cidade`. Validação
estrita por cidade (`_resultadoNaCidade`) e por prefixo de CEP (`_resultadoNoCep`)
descarta ruas homônimas em bairros/cidades errados.

### Endpoints proxy (backend)

- `GET /admin/geocode?q=...` — proxy do Nominatim `/search`.
- `GET /admin/reverse-geocode?lat=&lon=` — proxy do `/reverse` (zoom 18).

Ambos com **User-Agent próprio e fila de 1 req/s** (respeitando o ToS do
Nominatim). O frontend (ViaCEP/BrasilAPI/AwesomeAPI) é liberado no `connect-src`
da CSP (Helmet).

### Mini-mapa de cadastro

Leaflet (~280px) com pino arrastável. Arrastar dispara **reverse geocode** e
**sempre sobrescreve** endereço/bairro/cidade/UF/CEP com o retorno do Nominatim
(campo vazio do reverse mantém o atual). Race protection por sequência de
prefixo descarta respostas obsoletas em arrastos rápidos.

## Renderização do mapa (tiles via proxy)

Os tiles vêm do **Carto (tema dark)**, mas servidos pelo **nosso domínio** via
`GET /tiles/:z/:x/:y.png` (em `src/app.js`). Motivo: adblockers e firewalls
corporativos bloqueavam o CDN do Carto direto, deixando o mapa em branco. Como
tudo chega do mesmo origin, nada é bloqueado.

Otimizações do proxy:
- Validação `^\d+$` em z/x/y (anti-SSRF) e zoom ≤ 19.
- **Cache em memória** de até 4000 tiles (TTL 24h) — após o 1º hit, instantâneo.
- **Dedupe de inflight**: vários clientes pedindo o mesmo tile = 1 fetch upstream.
- Rotação de subdomínios `a/b/c/d.basemaps.cartocdn.com` para paralelismo.
- `Cache-Control: public, max-age=86400, immutable` (browser + CDN cacheiam).

Cliente Leaflet: `keepBuffer: 4`, `updateWhenIdle: false`, `updateInterval: 100`
(carrega durante o pan, sensação de fluidez).

> **Sem fallback OSM** e **sem markercluster** — decisões conscientes (ver
> `../../memory-bank/decisions.md`).

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
