# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Comprador primário: o síndico de condomínio.** Quase sempre um morador
voluntário, com frequência mais velho, sem formação técnica, que aceitou um
cargo desgastante e não quer se sentir diante de um painel de controle — quer
se sentir seguro. Ele não compra sensor; compra não ser cobrado na assembleia.

**Comprador secundário: administradoras prediais**, que gerenciam carteiras de
vários prédios e decidem por muitos síndicos de uma vez.

**Usuários operacionais (já atendidos pelo sistema existente):** técnicos de
campo da General (app mobile, GPS, ordem de serviço) e a equipe interna
(admin, gerente, operador).

Região: Grande São Paulo.

## Product Purpose

Monitorar remotamente o **nível dos reservatórios de água** e o
**funcionamento das bombas** de um condomínio, para que uma queda de nível ou
uma bomba parada vire alerta e chamado **antes de o morador perceber**.

Sucesso da landing: o síndico entrega o contato para uma instalação piloto.
Sucesso do produto: a falta d'água deixa de ser descoberta pelo interfone.

## Positioning

A General **já é a empresa que faz a manutenção hidráulica do prédio desde
2005**. A telemetria não é um produto de um fornecedor novo pedindo confiança:
é a mesma equipe que já troca a bomba passando a vigiá-la 24 horas. Um
concorrente de software não consegue copiar isso, porque não tem a equipe de
campo, o contrato de manutenção nem o histórico no prédio.

Mecanismo específico: mede a **coluna d'água real** por sonda 4–20 mA (não a
posição da boia) e a **corrente do motor** por sensor SCT-013 (não se o
disjuntor está ligado). Ausência de leitura também é evento: o silêncio do
sensor abre alerta próprio.

## Operating Context

O mundo do comprador: casa de máquinas, zelador, interfone, assembleia,
prestação de contas, rateio extra, caminhão-pipa de emergência, administradora.

O mundo de quem instala: quadro de comando, barrilete, prumada, cisterna,
caixa superior, alicate amperímetro, bomba de recalque e pressurizadora.

## Capabilities and Constraints

**Confirmado e funcionando:** leitura a cada ~10 s; alerta de nível baixo,
nível muito baixo e dispositivo offline; chamado automático classificado P1–P4
com prazo; ordem de serviço digital com foto e assinatura; relatório em PDF;
painel web para admin e cliente; app mobile; rastreamento GPS do técnico;
atendimento por WhatsApp com IA (código pronto, pendente de configuração).

**Restrições técnicas duras:** HTML/CSS/JS puro servido pelo Express — sem
build, framework ou TypeScript. CSP do helmet: `script-src 'self'` (nenhum
script inline), fontes e imagens precisam ser hospedadas em `public/`.
O formulário público posta em `POST /leads` (nome, condominio, email,
telefone, unidades, mensagem, honeypot `site`) e o backend não deve mudar.
`/login` precisa continuar funcionando e a landing não registra o service
worker.

**Faixas de alerta (idênticas ao backend):** baixo abaixo de 45 %, crítico
abaixo de 20 %. Qualquer ilustração de alerta precisa respeitá-las.

**Em aberto — não inventar:** os termos comerciais do programa piloto
(gratuito ou subsidiado, número de vagas, duração) ainda não foram definidos
pelo Pedro. Preço do produto também não.

## Brand Commitments

**Nome:** General Engenharia da Manutenção (domínio comercial
`generalbombas.com`; site institucional `ggeneral.com.br`).

**Identidade real, confirmada pelo Pedro e pelos arquivos:** azul-marinho e
amarelo. Extraídos dos próprios assets — `#071b5c` (azul do favicon),
`#0f243f` (azul do wordmark), `#fbb329` (amarelo da marca). Os uniformes da
equipe nas fotos são azul-marinho e amarelo, o que confirma a dupla.

⚠️ O `#f0b014` de `public/admin.css` é a interpretação do painel interno, **não**
a cor institucional. Em material voltado ao cliente vale o `#fbb329`.

**Logo:** `public/logo-azul.png` (marinho, para fundo claro) e
`public/login-logo.png` (branca, para fundo escuro) — esta é a versão que o
Pedro prefere. Marca gráfica: "G" com engrenagens amarelas
(`public/favicon.png`).

**Voz:** direta e sem jargão. O comprador não é técnico.

## Evidence on Hand

**Real e usável:**
- Fundação em **2005** — mais de 20 anos atendendo condomínios.
- **Fotografias reais da equipe em serviço**, em
  `~/Dropbox/GENERAL MANUTENÇÕES's shared workspace/Fotos empresa/`:
  dois técnicos uniformizados num conjunto de bombas Wilo; técnico ajustando
  bomba multiestágio; técnico experiente em quadro de comando; **técnico com
  alicate amperímetro medindo corrente** (liga diretamente ao sensor SCT-013 do
  produto); técnico em barrilete de tubulação verde.
- Contatos: (11) 2038-8679 · WhatsApp `wa.me/11966536110` ·
  comercial@generalbombas.com
- Um reservatório de teste real (`Res_Gen_Sup`) enviando leituras de verdade.

**Alegações que precisam de confirmação antes de publicar:**
- "400+ avaliações cinco estrelas no Google" — está no site institucional
  deles, mas não foi verificada nesta sessão.
- O site diz "aproximadamente 19 anos"; fundada em 2005, hoje seriam 21. O
  texto do site parece desatualizado — preferir "desde 2005".

**Ausências que não podem ser fabricadas:**
- **Zero clientes de telemetria.** Não existe depoimento, logo de cliente,
  estudo de caso nem número de desempenho do produto novo. A prova disponível
  é sobre a *empresa*, nunca sobre o produto.
- `public/alertas-front.png`, `tecnicos-front.png` e `whatsapp-ia.png` **não
  são o produto** — são mockups de referência com a marca "AQUA SMART" e dados
  fictícios. Não usar como screenshot.
- `fundo-agua.jpg` é imagem de banco genérica (respingo d'água).

## Product Principles

1. **A credibilidade vem da empresa, não do produto.** Zero clientes de
   telemetria, mas 20 anos de casa de máquinas. Toda prova se apoia nisso.
2. **O comprador é leigo e está cansado.** Clareza acima de sofisticação;
   nada que faça o síndico se sentir burro.
3. **Vender o desfecho, não o sensor.** Ninguém quer telemetria; querem não
   ter assembleia para explicar falta d'água.
4. **Nunca fabricar prova.** Sem depoimento, sem número inventado, sem
   screenshot que não seja do produto real.
5. **A equipe de campo é o diferencial.** Instalação, calibração e
   atendimento são da própria General — mostrar gente real fazendo isso.

## Accessibility & Inclusion

Público envelhecido: corpo de texto generoso, contraste alto e alvos de toque
grandes não são refinamento, são requisito de conversão. Interface em
português do Brasil.
