---
tags:
  - projeto
  - fluxo
aliases:
  - Nota fiscal
  - NFS-e
  - DANFE
  - Emissão de nota pelo Omie
---
# Fluxo: nota fiscal do orçamento, pelo Omie

O orçamento aprovado vira nota com um clique na ficha. A nota **sai do Omie**,
o ERP onde a General já emitia à mão. O sistema não fala com prefeitura nem
SEFAZ.

## A regra: uma nota por orçamento (17/11/2026)

| O orçamento tem… | Sai | No Omie | Estado |
|---|---|---|---|
| só serviço | **NFS-e** | OS → `FaturarOS` | ✅ implementado |
| qualquer peça | **só DANFE** (NF-e), com o serviço **embutido no preço das peças** (rateio proporcional, prévia antes) | Pedido de venda → `FaturarPedidoVenda` | ✅ implementado (18/11/2026) |

Mesmo com serviço junto, orçamento com peça **não** gera NFS-e. Foi decisão do
Pedro, não limitação técnica.

## Peça ou serviço: quem decide é quem emite

A linha do orçamento é texto livre ("Bomba Thebe 2cv", "MÃO DE OBRA
ESPECIALIZADA", "CONSERTO Mod: ..."), e até a migration 090 nada dizia o que
ela era. Hoje existe `orcamento_linhas.natureza` (`servico`|`peca`|NULL).

- O modal **sugere** pelo texto (`sugerirNatureza`) e a linha aparece
  marcada como "sugerido". Quem decide é o **começo da linha**: "Conserto
  de…", "Mão de obra…", "Limpeza e regulagem…", "Emissão de ART…" é serviço;
  o resto, peça. Prefixo como "Opção 01:" ou "01" é pulado, e o serviço
  também vale depois de um travessão ("Pressostato — reparo"). "Fornecimento
  de…" é peça (é o material).
- **Sugestão não emite.** O backend recusa (422) se alguma linha cobrável
  chegar sem natureza confirmada. O clique em Emitir manda a classificação
  inteira, e ela é gravada **antes** de qualquer chamada ao Omie, para valer
  mesmo que a emissão falhe adiante.
- Linha sem preço (`valor_unitario` NULL, migration 062) não entra na nota.

⚠️ **Até 18/11/2026 bastava a palavra aparecer em qualquer lugar.** "Zeolita
Areia Limpeza E Filtragem De Piscina - Pct 25kg" (OR-000201), um saco de
areia, saía como serviço por causa de "limpeza"; "Fita teste para medir cloro",
por causa de "teste". A regra do começo da linha foi conferida nas **507
linhas de orçamento de produção**: 500 iguais à regra antiga, e as 7 que
mudaram passaram a peça ("Fornecimento de tubos…", "Material hidráulico…",
a zeolita, a fita).
"USINAGEM DO EIXO" fica **peça** de propósito: no Omie ela é produto
(PRD00449) e sai em DANFE junto com rolamento e selo.

## DANFE: qual produto do Omie é cada peça

A NF-e exige que **cada item seja um produto cadastrado no Omie** (NCM,
unidade, tributação). O Omie não aceita "Luva de união 60mm" digitado: aceita
o produto PRD00268. A linha do orçamento é texto livre, então alguém tem que
dizer "esta linha é aquele produto". No modal, cada linha marcada como **Peça**
ganha um seletor:

- **Até 3 sugestões**, pela descrição da linha. A pontuação é a fração das
  palavras da linha que aparecem no produto, com peso maior para palavra
  rara (IDF: "seletora" vale mais que "bomba"). Desempata pelo que a General
  **já faturou**: entre três "adaptador com rosca", o que ela vende sobe.
- **A primeira palavra é o que a peça é, e pesa o triplo.** "Cola para tubo
  pvc" sugeria três tubos, porque "tubo" + "pvc" somavam mais que "cola".
  Palavras de embalagem antes dela são puladas ("Kit terminais…" → terminais).
- **Produto que é peça DE outra coisa perde 40%.** "ROTOR BOMBA 3CV",
  "BRACKET DA BOMBA RECALQUE" e "TAMPA REGISTRO GLOBO" contêm a palavra
  pedida, mas são rotor, bracket e tampa. A marca no começo do nome do
  produto ("AMANCO LUVA…", "Deca Torneira…") é pulada para achar o que ele é.
- **Plural e abreviação não atrapalham**: "JUNTAS" casa com "junta",
  "TERMINAIS" com "terminal", "VAL SELETORA" com "válvula seletora".
- **Medida diferente derruba.** "Cotovelo 60mm" casava 100% com "COTOVELO CB
  75MM", porque "cotovelo" é raro e pesa mais que "60mm". Produto com medida
  da mesma unidade (mm, cv, pol) e nenhuma igual à pedida perde metade da
  pontuação.
- **Busca** por nome ou código, no catálogo local.
- **Bitola (20/11/2026):** fração vira decimal (`1.1/2"`, `1 1/2`, `11/2` → 1.5), número sozinho até 12 é bitola, e mm ↔ polegada pela tabela de PVC (60 mm = 2"). Ver [pecas-no-orcamento.md](pecas-no-orcamento.md).
- **A linha pode chegar já ligada** ao produto, escolhido ao montar o orçamento (peças no orçamento, fase A). O modal só confere.
- **Lembrado da última vez**: quando o Omie aceita o pedido, a escolha fica
  em `omie_produto_vinculos` pela descrição normalizada. Na próxima linha com
  o mesmo texto, o produto **já vem escolhido**, marcado "usado da última vez".
- A sugestão comum **não** é escolhida sozinha. No levantamento de 18/11/2026,
  "Adaptador com rosca" bateu 100% com três adaptadores de NCM diferente, e o
  NCM vai para a nota.
- Peça que não existe no Omie se cadastra **lá**, à mão (o NCM é com o
  contador), e depois **Atualizar catálogo**. O sistema não cria produto.

A escolha fica em `orcamento_linhas.omie_produto_codigo` (migration 091),
gravada junto com a natureza, antes de qualquer chamada ao Omie.

### O catálogo é uma cópia local

`omie_produtos` (migration 091), para a busca não fazer 14 chamadas à API a
cada tecla. Vem de `ListarProdutos` (o Omie corta em 100 por página) e de
`ListarPedidos` dos **faturados** (`etapa: "60"`, 50 por página), que dão
`vezes_faturado` e `ultimo_cfop` de cada produto.

- Atualiza **sozinho em segundo plano** quando o modal abre e a cópia passou
  de 24 h, e pelo botão **Atualizar catálogo** no modal.
- Leva **cerca de 1 minuto e 10 s** (14 + 16 páginas, em série).
- Produto que sumiu do Omie fica `inativo`, não é apagado. Escolher um
  produto inativo bloqueia.

⚠️ **O Omie aceita uma requisição por método de cada vez.** Paralelizar as
páginas devolve "Já existe uma requisição desse método sendo executada". A
mesma chamada repetida em menos de 60 s devolve "Consumo redundante detectado".
Por isso a paginação é em série e só roda uma sincronização por processo.

### Levantamento de 18/11/2026: as peças existem no Omie?

Cruzando os 97 itens dos 47 orçamentos aprovados em produção com os 1.318
produtos do Omie:

- **A maioria existe**, e muitas com o nome exato que o orçamento usa:
  "LUVA DE UNIÃO 60MM" (PRD00268, faturado 37×), "TERMINAIS PARA PONTA DE
  CABO", "FITA ISOLANTE ALTA FUSÃO", "CONTATORA COM BLOCO DE CONTATO". Os
  PRD00xxx são os cadastros que a própria General criou.
- **O nome genérico é o problema**: "Veda rosca", "Adaptador", "Válvula de
  retenção", "Fita isolante" casam com 3 ou mais produtos. Daí o seletor.
- **Bate com o faturado à mão**: o OR-000306 (2 boias + 2 adaptadores + luva)
  saiu como pedido 879 com PRD00528, 01580 e PRD00268, e o OR-000270 (timer +
  terminais + cabo) como PRD00239, PRD00199 e 1111.
- Há NCM estranho no cadastro (ex.: "ADAPTADOR COM ROSCA AMANCO 60MM" com
  NCM 8536.69.90, que é de tomada elétrica). Isso é assunto do contador, e o
  modal mostra o NCM de cada sugestão justamente para aparecer.

## DANFE: o pedido de venda no molde

Copiado dos **77 pedidos faturados à mão** lidos em 18/11/2026. Constantes em
`MOLDE_NFE`:

- `codigo_cenario_impostos 5961933817`: o mesmo cenário fiscal em **todos**.
  O Omie calcula o imposto a partir dele (Simples, CSOSN 102), e aqui não se
  calcula nada.
- Categoria `1.01.02`, conta corrente `6109178168`, vendedor
  `6103322480` (os dos pedidos recentes), `consumidor_final S`, frete
  modalidade `9` (sem frete), `nao_movimentar_estoque S` por item.
- Parcelas: ver "Parcelas" abaixo (vale para os dois tipos).
- Etapa `50` ("Faturar") e depois `FaturarPedidoVenda`.
- **CFOP**: o cadastro do produto no Omie tem `cfop` **vazio nos 1.318**.
  Quem decide hoje é quem fatura: 5.102 quase sempre, 5.405 nos itens com ST
  (os PPR da Amanco). O sistema usa o `ultimo_cfop` com que o produto saiu e,
  sem histórico, 5.102. A prévia mostra o CFOP de cada item.
- **Fora de SP bloqueia.** 5.xxx é venda dentro do estado; fora seria 6.xxx,
  que não está no molde. Para condomínio a UF vem do cadastro; para avulso, do
  cadastro dele no Omie.

⚠️ **`FaturarPedidoVenda` mora em `/produtos/pedidovendafat/`**, com os
nomes de campo curtos (`nCodPed`), não em `/produtos/pedido/`. Responde 200
com `cCodStatus`, e diferente de `"0"` é recusa. A mesma armadilha do
`FaturarOS`.

## O molde da OS é cópia das notas feitas à mão

Levantado pela API em 17/11/2026, nas OS que a General faturou. **Não foi
inventado.**

- Linha de serviço **sem** apontar para o cadastro de serviços
  (`nCodServico: 0`, como em 7 de 10 OS recentes), com os códigos direto:
  `cCodServMun 140101`, `cCodServLC116 14.01`, `cTribServ 01`,
  `cNbs 120029000`, `cRetemISS N`. A descrição vai em maiúsculas.
- Cabeçalho: `cCodParc 000`, 1 parcela, categoria `1.01.02`, conta corrente
  `6109178168`, etapa `50`.
- Constantes em `MOLDE_NFSE` (`src/services/nota-fiscal.service.js`).

⚠️ **No cadastro do Omie há três serviços com 140101** (cód. 3, 5 e 11).
Escolher um deles mudaria o que sai na nota em relação ao que sai hoje. Por
isso se segue o molde, não o cadastro.

O **Omie calcula CBS/IBS** sozinho (0,9% e 0,1% na fase de teste de 2026).
Aqui não se calcula imposto nenhum. A empresa é Simples Nacional.

## Parcelas (NFS-e e DANFE)

Metade das OS e dos pedidos recentes feitos à mão é parcelada em 2 ou 3
boletos. O modal mostra **Pagamento** abaixo do total:

- A **quantidade** vem do texto livre do orçamento (`forma_pagamento`):
  "parcelado em 2x", "em 02 vezes", "em duas vezes", "até 03 vezes" (os que
  existem em produção). Sem número no texto, à vista. Pode ser mudada no
  modal (1 a 12), e a prévia diz "alterado aqui".
- O **calendário padrão** é o das notas feitas à mão (OS 3198–3207, pedidos
  854–864): **1ª parcela 5 dias depois** da emissão, as seguintes **uma por
  mês no dia da emissão** (dia que não existe no mês cai no último). Cada
  vencimento é editável.
- **Valores iguais**, com o centavo que sobra na última. Percentual com 4
  casas, o da última fecha 100.
- **À vista** continua `000` sem lista, como antes. **2 ou mais** vão com
  `999`, o único código que o Omie aceita com a lista de vencimentos:
  `Parcelas[]` na OS (`nParcela`, `dDtVenc`, `nValor`, `nPercentual`) e
  `lista_parcelas.parcela[]` no pedido (`numero_parcela`, `data_vencimento`,
  `valor`, `percentual`). Boleto: `tipo_documento BOL`, `meio_pagamento 15`.
- **Bloqueia**: vencimento antes de hoje, ou fora de ordem.
- O parcelamento **não é gravado** no orçamento: vai na emissão. A retomada
  acha a OS ou o pedido já criado, com as parcelas que foram.

⚠️ **As notas feitas à mão usam `002`/`003` com as datas editadas na
tela.** Pela API, a documentação diz que só o `999` aceita lista; com os
outros códigos o Omie calcula as datas sozinho. Por isso o `999`. A
primeira nota parcelada em produção é a que confirma: conferir no Omie se
as datas e os valores saíram como na prévia.

## Rateio: valor manual e serviço embutido

Se o orçamento tem total manual (`orcamentos.valor`, que sobrepõe a soma no
PDF), a nota precisa fechar nele. A distribuição é a mesma nos dois tipos: o
total é repartido na proporção do valor de cada linha, e o centavo que sobra
vai para a última.

- **NFS-e** (`ratear`): entre todas as linhas.
- **DANFE** (`ratearNfe`): **só entre as peças**. As linhas de serviço
  somem como item, e o valor delas entra no preço das peças. A prévia diz
  quanto foi embutido.

⚠️ **Quantidade maior que 1 que não divide em centavos.**
- Na NFS-e a linha vai com quantidade 1 e o texto "N un. — descrição".
- Na DANFE isso **não serve**: o item é o produto do cadastro, com a
  descrição dele, e 26 válvulas precisam sair como 26. A linha vira **dois
  itens do mesmo produto**: (q−1) a u e 1 a u + o resto. Ex.: 26 válvulas
  por R$ 6.690,00 → 25 × 257,30 + 1 × 257,50. Unitário com centavo fracionado
  dependeria da configuração de casas decimais do Omie, que não dá para
  conferir sem emitir.

## Cliente no Omie

1. `condominios.omie_cliente_codigo` (cache da 090), se já houver.
2. Senão, `ListarClientes` filtrando pelo CNPJ. O filtro aceita o documento
   com ou sem máscara.
3. Senão, `UpsertCliente` com `codigo_cliente_integracao = COND-<id>` e o
   endereço do cadastro (rua e número separados por regex).

Em 17/11/2026, 97 dos 118 condomínios já existiam no Omie pelo CNPJ.

⚠️ **Cliente avulso (pessoa física) não é criado automaticamente.** O
endereço dele é texto livre, e inventar bairro e CEP seria pôr dado errado em
documento fiscal. Se não existir no Omie, a emissão para com a instrução de
cadastrar lá.

## Retomável e sem duplicar

- `cCodIntOS` / `codigo_pedido_integracao` `= ORC-<id>`, determinístico.
  Antes de criar, `ConsultarOS` / `ConsultarPedido` por ele: uma OS ou pedido
  criado numa tentativa que caiu é **achado**, não duplicado. Dois documentos
  seriam duas notas.
- **Trava** no `UPDATE ... WHERE nota_status IS NULL OR 'erro'` contra clique
  duplo e duas abas. Um `processando` sem OS nem pedido e parado há mais de 5
  minutos é emissão que morreu no meio (deploy, queda) e pode ser retomado.
- `FaturarOS` só roda se `StatusOS.cFaturada` não for `S`;
  `FaturarPedidoVenda`, se o pedido não estiver na etapa `60`.
- **Trocar de tipo depois de uma falha é bloqueado.** Se a tentativa anterior
  deixou uma OS no Omie e agora a classificação pede DANFE (ou o contrário),
  seguir criaria o segundo documento para o mesmo orçamento. A prévia manda
  conferir no Omie.

## Depois do faturamento

A prefeitura (NFS-e) e a SEFAZ (DANFE) processam por conta própria, e o
número da nota pode não existir no instante em que a rota responde. Daí
`nota_status`:

| status | quando |
|---|---|
| `processando` | faturou e o número ainda não voltou. O botão **Atualizar** relê |
| `emitida` | `StatusOS` com `cFaturada S` e `ListaRpsNfse[0].nNfse`. Grava número e `cUrlNfse` (consulta pública nfse.gov.br) |
| `erro` | exceção na emissão, ou mensagens da prefeitura sem número. Texto em `nota_erro`; o trilho mostra **Tentar de novo** |
| `cancelada` | `cCancelada S` (cancelada no Omie). Reemitir pelo sistema é bloqueado: o `ORC-<id>` já pertence à OS cancelada |

**DANFE:** `ConsultarNF` com `nIdPedido` (o único método que filtra por
pedido; o `ListarNF` não filtra). Antes da nota existir ele responde
Client-107 "NF não cadastrada para o pedido", que é **processando**, não erro.
Com a nota: número em `ide.nNF`, `ide.dCan` preenchido = cancelada,
`ide.cDeneg S` = denegada (erro). O PDF vem de `ObterNfe`
(`/produtos/dfedocs/`, campo `cPdf`), e `cCodStatus "0"` ("Documentos
gerados com sucesso") é o que marca **emitida**. O código da NF fica em
`orcamentos.omie_nf_codigo`. Lido em 18/11/2026 contra o pedido 879 → NF 794.

⚠️ **`FaturarOS` mora em `/servicos/osp/`, não em `/servicos/os/`.** Quem
procura só na página da OS conclui que o método não existe. Foi o que
aconteceu aqui, e por algumas horas o roadmap dizia "faturar = etapa 50".

## ⚠️ Não existe ambiente de teste: kill-switch `OMIE_EMISSAO`

O Omie não tem sandbox de nota. Com as chaves no `.env`, um servidor local
apontando para o banco de **teste** emitiria nota **real** para um orçamento
de mentira. Por isso **emitir exige `OMIE_EMISSAO=1`**. Sem a variável, a
prévia e o Atualizar funcionam e o Emitir responde 503 "Emissão de nota
desligada neste ambiente". O modal mostra o motivo.

- **Local:** nunca ligar.
- **Produção:** ligar no Railway quando for emitir a primeira nota
  acompanhada.

Testes de rota: `ratear`, bloqueios, trava, retomada e kill-switch foram
exercitados contra o banco de teste com o `omie.service` trocado por dublês.
Nenhuma chamada de escrita foi ao Omie.

A DANFE tem teste versionado: `node scripts/testes/nota-fiscal-danfe.test.js`
(banco de teste, Omie dublê, recusa rodar em outro banco). Cobre o rateio com
quantidade, os bloqueios, o caminho inteiro pelas rotas (prévia → emitir →
atualizar), o molde do pedido, a memória da escolha, a retomada sem
duplicar, a NFS-e pelo caminho de sempre e o kill-switch. **Não prova que o
Omie aceita o payload**: isso só a primeira DANFE real, acompanhada.

## Pré-requisitos (fora do código)

- **Addon "APIs Omie"** na Omie Store: R$ 49,90/mês por aplicativo,
  contratado em 17/11/2026. Sem ele **toda** chamada falha, inclusive leitura,
  com "necessário ativar um addon na Omie Store". Atraso de pagamento pausa o
  serviço.
- `OMIE_APP_KEY` / `OMIE_APP_SECRET`: ficam em developer.omie.com.br →
  Aplicativos, não nas Configurações do ERP. **Nunca clicar em "Gerar nova
  chave"**: isso derruba quem já usa as atuais.
- Certificado A1 já está no Omie (exigido pela DANFE).

## Fora do escopo por enquanto

- Orçamento de **limpeza de reservatório e dedetização** (`tipo` ≠ `pecas`)
  usa outro código de serviço (dedetização é 07.13). Bloqueado com mensagem;
  continua sendo emitido no Omie.
- DANFE para **fora de SP**: bloqueada, emitida no Omie.
- Cadastrar produto novo no Omie pelo sistema (o NCM é com o contador).
- Enviar a nota por e-mail junto com o orçamento.

---

Relacionados: [orcamentos-envio.md](orcamentos-envio.md) ·
[ordens-servico.md](ordens-servico.md) · [../banco-de-dados.md](../banco-de-dados.md) ·
[../api.md](../api.md)
