---
tags:
  - projeto
  - fluxo
aliases:
  - Guias de tributos
  - Guias
  - DAS no contas a pagar
  - Onvio
  - Contas a pagar por boleto
  - Regra pelo emissor
---
# Fluxo: guias de tributos → contas a pagar do Omie (23/11/2026)

Pedido do Pedro em 23/11/2026. O contador publica as guias (DAS, DARF, FGTS,
DAE, parcelamento...) no **Onvio** (o portal da Thomson Reuters/Domínio), e
hoje alguém baixa cada PDF e **digita** a conta a pagar no Omie. Agora o PDF
entra no sistema, o sistema lê a guia e, depois da conferência, cria a conta
a pagar no Omie com o PDF anexado.

Parte de [omie-integracao.md](omie-integracao.md) (é o primeiro pedaço da
fase 4, contas a pagar, mas no sentido contrário: aqui o sistema **grava** a
conta a pagar, em vez de só ler).

## Por que não direto do Onvio

O Onvio tem uma API (a "Onvio BR Accounting API", OAuth 2.0, com o cliente do
contador como dono dos dados), mas a documentação pública só mostra a
autenticação: **não deu para confirmar** se ela lista e baixa as guias
publicadas. O acesso é pedido por e-mail ao time da API. Por isso a primeira
metade (baixar o PDF do Onvio) continua à mão, e a segunda (ler e lançar)
ficou automática. Quando a API confirmar o download das guias, o PDF passa a
entrar sozinho por ela; o resto do fluxo não muda.

As **solicitações de RH** (folha, férias, rescisão, afastamento), que também
são feitas no Onvio, **não entraram**: dependem de a API expor isso, o que
também não está confirmado.

## O caminho

1. **Financeiro → Guias** (só o admin, só o painel novo, `#/financeiro/guias`).
   "Enviar PDF" ou arrastar os PDFs para a tela (vários de uma vez).
2. O servidor lê o PDF (`guia-leitura.service.js`, com `pdfjs-dist`):
   - **o código de barras** (linha digitável de arrecadação, 48 dígitos, ou
     boleto, 47): os dígitos verificadores precisam bater, então número de
     documento ou CNPJ colado não vira código de barras;
   - **o valor sai do código de barras**, não do texto (é o que o banco vai
     cobrar). Texto diferente do código vira aviso;
   - **o vencimento sai do texto** ("Pagar este documento até", "Data de
     Vencimento"...). O código de arrecadação não traz vencimento; só o
     boleto traz, pelo fator. Sem vencimento, a guia entra com aviso;
   - tipo (DAS, DARF, FGTS Digital, DAE, GPS, parcelamento, municipal),
     competência, número do documento e CNPJ do contribuinte.
   - Um PDF com duas guias vira duas linhas. PDF sem código de barras
     (escaneado, ou o FGTS pago por PIX) entra com o que deu para ler e o
     aviso "digite a linha digitável".
3. A **regra do tipo** (`guias_regras`) já põe fornecedor, categoria e conta
   do Omie. Semeada com o que o próprio Omie mostrou (abaixo).
4. **Conferência** no painel: tipo, competência, vencimento, valor, linha
   digitável, nº do documento, fornecedor (busca na cópia dos cadastros do
   Omie, sem chamar o Omie), categoria e conta (lidas do Omie, guardadas 6 h).
   "Usar sempre para este tipo" grava a regra.
5. **"Lançar no Omie"** salva o formulário, mostra a confirmação (guia, valor,
   vencimento, fornecedor, categoria, conta) e cria a conta a pagar
   (`financas/contapagar` `IncluirContaPagar`, tipo `BOL`, com a linha no
   mesmo formato que a importação por código de barras do Omie grava). Depois
   anexa o PDF (`geral/anexo` `IncluirAnexo`, tabela `conta-pagar`, o PDF num
   zip e o MD5 do zip). Anexo que falha não desfaz a conta a pagar: o painel
   mostra "Anexar de novo".

## Conta que não é tributo: a regra pelo emissor (24/11/2026)

A tela serve também para **qualquer conta a pagar com código de barras**:
boleto de fornecedor, água, luz, telefone. Para essas, o destino no Omie
sai de **quem cobra**, não do tipo. Antes, todas caíam em "outro", uma regra
só, e a Vivo dividia o fornecedor com a Sabesp. Migration **107**.

**1. O leitor tira a chave do emissor** (`emissorDe` em
`guia-leitura.service.js`), da mais estável para a menos:

| Chave | Quando | De onde |
|---|---|---|
| `cnpj:<14>` | boleto com o CNPJ do beneficiário; conta de concessionária com CNPJ no cabeçalho | boleto: o 1º CNPJ até 120 caracteres depois de "Beneficiário"/"Cedente"; concessionária: o 1º CNPJ que não é o da General |
| `arr:<segmento>:<empresa>` | concessionária sem CNPJ legível (arrecadação, segmentos 2, 3, 4, 6 e 7) | a identificação Febraban da empresa **no código de barras** |
| `bol:<banco>:<agência>-<conta>` | boleto sem CNPJ | Bradesco (237) e Itaú (341): a agência/conta no campo livre do código de barras; outros bancos: "Agência/Código do Beneficiário" no texto, com 6 dígitos ou mais |

O CNPJ da General (`26.427.361/0001-02`, `EMPRESA_CNPJ`) nunca é o emissor: ele
aparece como pagador. **Tributo não tem chave.** Arrecadação dos segmentos 1
(prefeitura) e 5 (governo) usa a regra do tipo, porque a Receita é a
emissora de DAS, DARF e parcelamento, que vão para categorias diferentes.

**2. O tipo:** tributo só vem por arrecadação dos segmentos 1 e 5. Boleto e
conta de concessionária são sempre "outro", mesmo com "prefeitura" no texto.

**3. O destino ao receber o PDF** (`_destino` em `guias.service.js`):
1. tributo → a regra do tipo (`guias_regras`), como antes;
2. "outro" com emissor → a regra do emissor (`guias_emissores`), se gravada;
3. sem regra → o fornecedor achado na **cópia dos cadastros do Omie**
   (`omie_clientes.documento`, sem chamar o Omie), pelo CNPJ; pelo CNPJ
   mascarado se só um cadastro bate; ou pelo nome do beneficiário se só um
   bate. Vem com a conta da regra "outro" e **sem categoria**;
4. "outro" sem emissor → a regra "outro" (o comportamento de antes).

A tela diz de onde veio o fornecedor ("achado pelo CNPJ de quem cobra",
"pela regra deste emissor"...).

**4. A categoria sugerida:** com fornecedor e sem categoria, a tela pede
`GET /admin/guias/sugestao?fornecedor=` e recebe a categoria e a conta mais
usadas nos títulos dele no Omie (só leitura, a mesma consulta do lançamento,
guardada 3 min). A tela preenche o que está vazio e mostra "usada em N de M
títulos".

**5. "Usar sempre":** numa conta com emissor, a caixa vira "sempre que vier
de <nome>" e grava em `guias_emissores`, sem mexer na regra do tipo. Na
próxima conta do mesmo emissor, fornecedor, categoria e conta já vêm prontos.
Na linha digitada à mão (PDF escaneado), a chave sai só do código de barras.

**Conferido com 5 PDFs reais** (24/11/2026; a cópia do Omie de produção só
foi lida):

| PDF | Antes | Agora |
|---|---|---|
| Boleto Cora (Kompleta) | `cnpj` = o da General (pagador) | `cnpj:31530910000100` → KOMPLETA pelo CNPJ |
| Boleto Bradesco (Alelo), sem CNPJ | outro, sem nada | `bol:237:2374-0181397` → ALELO pelo nome |
| Conta da Enel (boleto Bradesco) | **"Guia municipal"** (o texto fala em prefeitura) | outro, `bol:237:…`; o CNPJ mascarado `61.***.***/****-93` bate com **dois** cadastros (Enel e SPAL), então o fornecedor fica para escolher uma vez e "usar sempre" |
| Conta da Sabesp (arrecadação, segmento 2) | **"DAS"** (o "DAS 8H" do horário de atendimento) | outro, `cnpj:43776517000180` → SABESP pelo CNPJ |
| DARF DCTFWeb | DARF | DARF, sem emissor (vale o tipo) |

⚠️ As siglas (DAS, DAE, GPS, ISS, TFE) agora só valem em **maiúsculas**. E nas
contas que não são tributo não aparece mais o aviso "o texto diz X, o código
diz Y": numa fatura, o "valor do texto" pega subtotal.

## As travas contra conta a pagar em dobro

O Omie não tem ambiente de teste, e hoje as guias são lançadas à mão lá.

| Trava | Como |
|---|---|
| A mesma guia subida duas vezes | código de barras único entre as guias vivas (índice da 100): o reenvio devolve a guia que já existe ("já estava aqui") |
| A mesma guia lançada à mão no Omie | antes de incluir, os títulos do fornecedor no Omie (`ListarContasPagar` por `filtrar_cliente`) são comparados: mesmo código de barras, ou mesmo valor e vencimento → **409 com a lista**, a guia volta a "a conferir" e só **"Lançar mesmo assim"** passa |
| Queda sem resposta | o código de integração é fixo por guia (`GB-GUIA-<id>`). A queda vira `incerto`; a nova tentativa pergunta ao Omie por esse código (`ConsultarContaPagar`) antes de incluir, e acha a que entrou |
| Clique duplo, duas abas | `status = 'enviando'` atômico (`FOR UPDATE`) + fila no processo (o Omie atende um método por vez) |
| Ambiente de teste | exige **`OMIE_EMISSAO=1`** (a mesma chave das notas e do lote); sem ela, 503 e nada vai |

⚠️ **`filtrar_por_data_de/ate` do `ListarContasPagar` filtra pela data de
inclusão, não pelo vencimento** (conferido em 23/11/2026). Por isso a
comparação é pelo fornecedor. A lista do fornecedor fica guardada 3 min: o
Omie recusa a mesma consulta repetida em menos de 60 s.

## O que o Omie mostrou (leitura de 23/11/2026, contas a pagar de set–nov)

Todas as guias de tributos vão pela conta **BRADESCO \*** (`6109178168`):

| Guia | Categoria no Omie | Fornecedor usado |
|---|---|---|
| DAS (Simples Nacional) | `2.06.99` Simples Nacional (DAS) | Receita Federal (`5993951792`) **e** Prefeitura de SP (`5993972859`), misturados |
| Parcelamento | `2.06.98` PARCELAMENTO | os dois, misturados |
| TFE/TFA | `2.06.97` TFE/TFA | Prefeitura de SP |
| FGTS | `2.03.07` FGTS | os dois, misturados |
| INSS (DAE/GPS) | `2.03.06` Contribuição Previdenciária | (sem exemplo no período) |

As regras semeadas usam **Receita Federal** para as federais e a Prefeitura
para a municipal. ⚠️ **Para o Pedro decidir:** o DAS e o FGTS lançados com a
Prefeitura como fornecedor parecem engano de digitação; se o contador usa
outro critério, muda a regra na tela ("Usar sempre para...").

O próprio Omie já tem "importação a partir de um código de barras" (é dela a
observação "Incluído pela importação a partir de um código de barras" em
alguns títulos): ela lê o valor, mas não sabe o tipo, a categoria nem o
fornecedor, e não anexa o PDF.

## O leitor validado contra dados reais

As 18 linhas digitáveis que já estavam no contas a pagar do Omie (DAS,
parcelamento, prefeitura, Vivo e boletos Itaú/Bradesco) foram lidas pelo
leitor: os 18 valores batem com o `valor_documento` do Omie, e a linha
formatada é idêntica à que o Omie grava. Foi isso que pegou o erro do
identificador "8" (ver o comentário de `lerArrecadacao`): **DAS e DARF usam
módulo 11 e valor em reais**, não módulo 10.

## Testado

- `scripts/testes/guias-tributos.test.js` **46/46**: leitor (DVs, valor, fator
  de vencimento depois da virada de 2025); um DAS em PDF de verdade (gerado
  pelo Chrome) vira guia com tudo lido; reenvio não duplica; PDF sem código
  entra para digitar; linha errada e valor divergente são 400; regra por
  tipo; 503 sem `OMIE_EMISSAO`; 409 com a lista quando o Omie já tem a guia;
  "lançar mesmo assim"; payload (integração, datas, linha, categoria, conta);
  zip válido com o PDF e o MD5; queda → incerto → consulta sem incluir de
  novo; anexo que falha e "anexar de novo"; 403 para gerente, operador e
  admin fora do painel novo.
- **64/64** com a regra pelo emissor (24/11/2026): CNPJ do beneficiário (não
  o do pagador nem o do intermediário); Bradesco sem CNPJ pela agência/conta;
  "prefeitura" num boleto não vira municipal; CNPJ mascarado guardado;
  concessionária pelo CNPJ e, sem ele, pela empresa Febraban; "das 8h" não é
  DAS; tributo sem emissor; linha digitada dá o emissor; pela rota: boleto
  acha o fornecedor pelo CNPJ na cópia, sugestão (mais usada, sem os
  cancelados, 400 com fornecedor inválido), "lembrar" grava a regra do
  emissor sem mexer na do tipo, o 2º boleto já chega com a regra, trocar
  para tributo e voltar.
- Na tela (24/11, banco de teste, os PDFs da Kompleta e da Alelo): fornecedor
  "achado pelo CNPJ de quem cobra", a categoria sugerida pelo histórico real
  do Omie (só leitura), a caixa "sempre que vier de...".
- Na tela (banco de teste, 1440px e 375px): lista, chips, "Pede ação",
  painel, busca de fornecedor na cópia, categorias e contas lidas do Omie de
  verdade (só leitura), salvar com a linha digitada, o aviso do 409
  (resposta simulada no navegador), reenvio pela tela.
- **Nunca chamado de verdade:** `IncluirContaPagar` e `IncluirAnexo` saíram
  da documentação do Omie. Proposta: a primeira guia real é lançada com o
  Omie aberto ao lado, para conferir a conta a pagar e o anexo. Se o anexo
  recusar, o suspeito é o MD5 (a doc não diz se é do zip ou do arquivo).

## O que falta

- ✅ Migration **100** em produção (conferida em 23/11/2026).
- ✅ Migration **107** (regra pelo emissor) em teste e em produção (24/11/2026,
  conferida no `information_schema`, antes do push).
- `OMIE_EMISSAO=1` no Railway (é a mesma chave das notas e do lote).
- A primeira guia real acompanhada.
- Pedir acesso à API do Onvio (e-mail ao time da Onvio BR API) e perguntar
  se ela baixa as guias publicadas e abre solicitações de RH.
- Guia que chega por e-mail (se o escritório manda aviso com o PDF): ainda não.

## Arquivos

`migrations/100_guias_tributos.sql` · `migrations/107_guias_emissores.sql` ·
`src/services/guia-leitura.service.js`
(o leitor) · `src/services/guias.service.js` (fila, regras, lançamento) ·
`src/routes/guias.routes.js` · `src/services/omie.service.js` (contas a pagar,
anexo, categorias, contas correntes) · `public/admin-guias.js` ·
`public/admin-financeiro.js` (a troca "Guias") · `public/admin.css` (bloco
`gu-`). Dependência nova: `pdfjs-dist` 4.10.38 (o build legacy roda no Node
sem canvas).
