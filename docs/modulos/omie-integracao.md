---
tags:
  - projeto
  - fluxo
aliases:
  - Integração com o Omie
  - Omie
  - Contas a receber
  - Inadimplência
  - Conciliação bancária
---
# Fluxo: o que trazer do Omie (📋 plano, 20/11/2026)

Pedido do Pedro em 20/11/2026. A partir de janeiro de 2027 ele cuida do
escritório sozinho, e quer ver no sistema o que hoje exige abrir o Omie:
contratos, o faturamento do começo do mês, quem pagou e quem atrasou, o que
vence para pagar e o caixa. **Estoque fica de fora** (a empresa não trabalha
com estoque).

O que já existe e é a base de tudo:
[nota-fiscal.md](nota-fiscal.md) (emissão da nota do orçamento pelo Omie, com o
cliente criado lá) e [agenda.md](agenda.md) (cópia de hora em hora dos
contratos e das notas de contrato do Omie, só leitura).

## Regras que valem para todas as fases

- **O Omie continua sendo o financeiro.** Contrato, título, boleto e nota
  nascem e são baixados lá. O sistema **lê, mostra, cruza com o prédio e avisa**;
  quando precisar agir, manda o Omie fazer pela API, atrás de um interruptor
  (como o `OMIE_EMISSAO`), porque **não existe ambiente de teste no Omie**.
- **Sempre por uma cópia no banco**, atualizada por job no padrão do projeto
  (`setTimeout` recursivo, intervalo em `config.service.js`). O Omie recusa a
  mesma consulta repetida em menos de ~1 minuto ("consumo redundante"), então
  tela nenhuma chama a API direto.
- **O elo com o prédio é o CNPJ** (o código do cliente no Omie → `ListarClientes`
  → CNPJ → `condominios.cnpj`). O que não casar vai para uma fila "ligar à
  mão", nunca é adivinhado por nome.

## O que o levantamento mostrou (banco de teste, cópia de 19/11/2026)

| Dado | Achado |
|---|---|
| Contratos no Omie (`omie_contratos`) | **151**: 81 ativos (situação `10`, R$ 59 mil/mês, 78 clientes, todos faturam no dia 1), 38 em `90`, 28 em `99`, 4 em `00` |
| Contratos do sistema (`contratos`) | **0** no banco de teste. Os dois cadastros nunca foram ligados |
| Notas de contrato | out/2026: 80 notas (R$ 60,9 mil); nov/2026: 77 (R$ 56,9 mil) |
| Ativo com vigência vencida | **4** (já apontados em [agenda.md](agenda.md)) |
| A cópia guarda o cliente? | Só o código do Omie (`omie_cliente`). Sem CNPJ, sem nome: hoje não dá para dizer de qual prédio é cada contrato |

⚠️ **Não deu para ler a API daqui.** As chaves `OMIE_APP_KEY`/`OMIE_APP_SECRET`
estão só no Railway, não no `.env` local; e a leitura em produção é do Pedro.
Contas a receber, a pagar, boletos e contas correntes **não foram vistos
ainda**: o primeiro passo de cada fase abaixo é um levantamento só de leitura,
como o de 18/11. O script fica pronto (só aceita chamadas `Listar`/`Pesquisar`/
`Consultar`/`Obter`).

## As fases

### 1. Contratos ligados ao prédio ✅ no código (20/11/2026, migration 096)

> **Feito.** A sincronização de hora em hora copia também os clientes do Omie
> (`omie_clientes`, CNPJ só em dígitos; se a leitura deles falhar, contratos e
> notas seguem copiados). `GET /contratos/omie` liga cada contrato ao prédio:
> elo à mão (`omie_cliente_vinculos`), senão o CNPJ quando bate com **um**
> prédio, senão nenhum e o motivo. Na tela, **"Contratos no Omie"** fica no
> topo de Contratos (`admin-omie-contratos.js`, no molde): chips Ativos · Sem
> prédio · Vigência vencida · Suspensos e em elaboração · Encerrados · Todos; o
> painel tem o prédio (ou o motivo de não ter) — desde 20/11/2026 a tela
> Contratos é item próprio do menu, na Carteira, abaixo de Condomínios, com
> as abas "No Omie" e "Assinados no sistema" (esta com "Fora do Omie": ativo
> aqui, sem contrato ativo no Omie para o prédio); "Ligar a este prédio" com o
> seletor de prédio e até três parecidos pelo nome **como sugestão** (só o
> clique grava), "Trocar o prédio", "Desfazer o elo à mão", a cobrança, a
> última nota e o cliente no Omie; o admin tem "Atualizar do Omie". O cartão
> antigo virou **"Contratos assinados no sistema"** (o fluxo de assinatura,
> intacto). O contrato ativo do Omie entra na **lista de Condomínios** (coluna
> Contrato com "no Omie", visão "Sem contrato", frase "R$ … por mês em
> contratos no Omie") e na **página do prédio** (topo e bloco "Contrato e
> preventiva", que abre o contrato na tela Contratos), sempre que o prédio não
> tem contrato no sistema.
>
> **Testado:** `scripts/testes/omie-contratos.test.js` 22/22 (sincronização com
> o Omie simulado + as rotas: CNPJ único liga, repetido não, sem CNPJ e sem
> prédio não, à mão vale sobre o CNPJ, DELETE volta, 404/400/403); agenda
> 21/21. Na tela (banco de teste, 1900px e 375px): os 151 contratos reais da
> cópia, ligar um à mão, ver na lista de Condomínios e na página do prédio,
> abrir pela página e desfazer. **Não testado com clientes reais:** as chaves
> do Omie estão só no Railway; a primeira cópia dos clientes acontece na
> primeira volta do job em produção, depois do deploy. ✅ **096 em produção
> (20/11/2026).** Se os prédios de produção não tiverem CNPJ, todos os
> contratos caem em "Sem prédio" e são ligados à mão (as sugestões por nome
> ajudam).

- Copiar também o **cliente** do contrato (`ListarClientes`: CNPJ, razão
  social, e-mail) e ligar cada contrato do Omie a um `condominio_id` pelo CNPJ.
- O contrato do Omie aparece na página do prédio, na tela Contratos e na
  coluna Contrato de Condomínios (valor, dia de faturamento, vigência,
  situação). A frase "R$ 0,00 por mês em contratos" passa a ser verdade.
- Fila **"Contratos sem prédio"**: o que não casou pelo CNPJ, com "ligar a
  este prédio" à mão (grava o vínculo, não mexe no Omie).
- Aviso: **ativo no Omie com vigência vencida** (os 4 de hoje), e prédio
  ativo sem contrato nenhum.
- ⚠️ Decidir: o contrato **assinado no sistema** (ZapSign/assinatura própria)
  e o do Omie são o mesmo documento? Proposta: o do sistema é o papel
  assinado; o do Omie é a cobrança; os dois ficam ligados, nenhum substitui o
  outro.

### 2. O faturamento do dia 1 ✅ no código (20/11/2026, migration 097)

> **Feito, sem faturar nada de verdade ainda.** No dia proposto (o dia
> configurado em `omie.faturamento_dia`, padrão 1, ou o próximo dia útil) a
> Agenda mostra "Conferir e faturar os contratos". O painel do mês virou o
> **lote** (`admin-faturamento-lote.js`, aberto por `_agAbrirFaturamento`, o
> mesmo da Agenda, do Financeiro e do Hoje): quem entra (com a conta, o valor
> e a caixa "vai agora"), quem já tem nota pela tela do Omie, quem ficou de
> fora e por quê (vigência acabada, conta fora do Sicredi/Bradesco, contrato
> não ativo, valor zerado), os tirados (com "Devolver"), o envio sem resposta
> (com "Não saiu, liberar") e os faturados pelo sistema (OS, NFS-e,
> vencimento, nosso número). "Faturar N · R$ X" abre a confirmação com o
> total e o banco; só "Sim, faturar" chama o Omie
> (`servicos/contratofat/` `FaturarContrato`, um por vez). O dia muda no
> próprio painel.
>
> **As travas contra nota em dobro** (src/services/omie-lote.service.js):
> uma linha por (competência, contrato) em `omie_faturamento_itens`; quem tem
> nota do mês na cópia fica fora; antes de enviar, o Omie diz quem considera
> pendente no mês (`ObterContratos cEtapa 20`) e só esses vão; a lista e o
> total têm de bater com o que a tela mostrou; um lote por vez; queda sem
> resposta vira `incerto` e não vai de novo sozinha. A sincronização de hora
> em hora devolve a nota (pela OS) e o título com o boleto (pela nota) ao
> item, e resolve o incerto quando a nota aparece. Exige **`OMIE_EMISSAO=1`**
> no servidor; sem ela o painel monta o lote e avisa que confirmar não envia.
>
> **Testado:** `scripts/testes/omie-lote.test.js` 36/36, com o Omie simulado
> do começo ao fim. Na tela (banco de teste, 1900px e 375px) com a cópia real
> de novembro (77 com nota pela tela do Omie, 4 com vigência acabada) e
> contratos de mentira para o lote, tirar, devolver, mudar o dia e a recusa
> sem `OMIE_EMISSAO`. **Nenhuma nota real foi emitida.** O
> `FaturarContrato` saiu da documentação do Omie e nunca foi chamado: a
> primeira chamada real será a do Pedro. Proposta: na primeira vez, faturar
> **um contrato só** e conferir nota e boleto no Omie antes do resto. ⚠️
> ✅ **097 em produção (20/11/2026).** Falta `OMIE_EMISSAO=1` no Railway antes do primeiro lote;
> e a partir daí **ninguém fatura contrato pela tela do Omie**.
>
> **O boleto (20/11/2026).** Em out–nov/2026, 226 de 239 títulos tinham
> boleto gerado pelo Omie no mesmo dia da nota: o contrato manda boleto
> (`emailCliente.cEnviarBoleto`) e a conta do Sicredi tem cobrança. O
> esperado é o `FaturarContrato` sair igual, mas a doc não garante. Por isso
> a sincronização guarda se o título tem boleto (`boleto_gerado`), e o painel
> avisa **"N notas sem boleto"** no topo e, na linha, "Sem boleto no Omie" com
> o botão **"Gerar boleto"** (confirmação com prédio, valor, vencimento e
> banco). Só então o sistema pergunta ao Omie se o título já tem boleto
> (`ObterBoleto`, alguém pode ter gerado pela tela de lá: aí só guarda) e,
> se não tem, gera (`financas/contareceberboleto/` `GerarBoleto`). Recusa do
> Omie libera para pedir de novo; queda sem resposta trava 10 min. Título
> pago ou cancelado não pede. Exige `OMIE_EMISSAO=1`. Testado com o Omie
> simulado (`omie-lote.test.js` 48/48) e na tela; **nunca chamado de
> verdade**.

- Já existe: "Faturar contratos no Omie: 77 de 81" na Agenda. Vira uma tela
  do mês: **quem foi faturado, quem não foi e por quê** (vigência vencida,
  contrato pausado, nota rejeitada), com o número da nota e o PDF.
- (Plano original, já resolvido acima.) ⚠️ Emitir dos dois lados dá nota em
  dobro. A API deixa **disparar o faturamento do contrato** pelo Omie
  (`FaturarContrato`): o sistema manda o Omie fazer, e a nota continua sendo
  do Omie.
- ✅ **Conferido pela API (20/11/2026): hoje o faturamento é feito à mão, em
  lote.** Das 173 NFS-e de 01/10 a 20/11, 157 são de contrato. Elas saíram
  em dois lotes: 79 no dia 01/10, todas às 11h, e 70 no dia 03/11, às 16h
  (primeiro dia útil depois do feriado de 02/11); o resto são avulsas dos
  dias seguintes. Todas foram incluídas e emitidas pelo mesmo usuário
  (`P001010854`). Um faturamento automático rodaria no dia 1 mesmo caindo no
  domingo (01/11) e não esperaria a tarde do dia útil. A API não mostra a
  configuração de faturamento automático do contrato, então o Pedro confirma
  no Omie que não há nada agendado. Se o sistema passar a disparar o lote,
  **ninguém fatura mais pela tela do Omie**.
- ✅ **Decidido pelo Pedro (20/11/2026): o sistema nunca fatura sozinho.** No
  dia do faturamento ele **avisa e prepara o lote** (quem entra, valor, conta
  Sicredi, e quem fica de fora e por quê); o Pedro confere, tira quem
  quiser e **confirma**. Só então as notas saem. **O dia é dele:** o dia do
  mês em que o lote é proposto fica nas configurações (padrão 1; dia que cai
  em fim de semana ou feriado passa para o próximo dia útil), e dá para
  faturar antes ou depois da data proposta. Sem a confirmação, nada sai.
- Notas por prédio na página dele (contrato e avulsas), com o link do PDF.

### 3. Contas a receber: quem pagou, quem atrasou

> **A cobrança dos atrasados ✅ no código (23/11/2026, migration 099).**
> Financeiro → **"Em atraso"** (só o admin, `#/financeiro/atraso`,
> `admin-cobranca.js` no molde de lista): os títulos vencidos **das notas que
> o sistema emitiu**, com cliente, prédio, dias de atraso, valor, banco e
> origem; no painel, telefone do Omie (WhatsApp quando é celular), e-mail,
> prédio, os outros atrasados do mesmo cliente, **"Abrir boleto"** e
> **"Marcar como pago"** (só no sistema). O total entra no "Pede ação".
>
> **Como sabe o que é do sistema:** o título do Omie traz `nCodOS` e
> `nCodPedido`. Entra se a OS é a de um orçamento (`omie_os_codigo`, NFS-e) ou
> a de um contrato do lote (`omie_faturamento_itens.omie_os`), se o pedido é o
> de um orçamento (`omie_pedido_codigo`, DANFE), ou se é o `titulo_omie` que a
> conciliação do lote já guardou.
>
> **Quem tira da lista:** a baixa no Omie (o Sicredi baixa sozinho pela API;
> o Bradesco quando o arquivo de retorno é importado lá — o Pedro confirmou em
> 23/11/2026 que importa) ou a marca à mão. A cópia (`omie_receber_atrasados`)
> é trocada inteira a cada volta da sincronização de hora em hora
> (`ListarContasReceber` com `filtrar_por_status: ATRASADO`, 100 por página),
> depois da conciliação do lote; a marca à mão mora em `omie_receber_pagos` e
> a sincronização não mexe nela. A cópia dos clientes passa a trazer telefone
> e contato.
>
> **Levantamento de 23/11/2026 (leitura pela API):** 190 títulos
> `ATRASADO` no Omie, R$ 268,7 mil — 18 até 30 dias, 36 de 31 a 90, 69 de 91
> dias a 1 ano (Sicredi e Bradesco) e 67 com mais de 1 ano (só Sicredi).
> Quase tudo é a herança sem baixa, que a decisão de 20/11 deixa de fora; por
> isso a lista nasce quase vazia e cresce com o lote e as notas de orçamento.
> O retorno CNAB 400 do Bradesco (exemplo `CB191100.RET`, 18/11/2026) foi
> lido: entradas confirmadas (02, com motivo 76 = pagador DDA), baixa sem
> pagamento (10) e nenhuma liquidação (06). A conferência pelo arquivo **não
> foi feita**: com o retorno importado no Omie, a baixa chega por lá.
>
> **Testado:** `scripts/testes/omie-cobranca.test.js` 27/27 (Omie simulado:
> só os três títulos do sistema entram, o de fora não; telefone copiado;
> 403 para gerente e operador; marcar e desmarcar pago; link do boleto uma
> vez só; título baixado some e a marca à mão fica). Na tela com títulos de
> mentira, 1440px e 375px. ✅ **099 em produção (23/11/2026)**, antes do
> push. **Falta:** "Recebimentos atrasados" no Hoje e o aviso na página do
> prédio; segunda via por e-mail.

- Cópia dos títulos a receber (`financas/contareceber/ListarContasReceber`):
  vencimento, valor, situação, pago em, boleto, de qual nota/contrato.
- **No Hoje:** "Recebimentos atrasados" (prédio, valor, dias de atraso).
- **Na página do prédio:** aviso de débito antes de mandar técnico ou
  orçamento.
- **Marcar à mão** quem pagou (pedido do Pedro), e **conferir pelo arquivo
  do banco** (ver abaixo).
- Segunda via: mandar ao síndico o boleto e a nota do mês pelo e-mail do
  cadastro, o mesmo caminho do envio da O.S.

#### A conferência pelo arquivo do banco

O Pedro tira um arquivo do banco e quer jogar aqui para o sistema dizer quem
pagou. Dois formatos possíveis, e decidem o desenho:

| Formato | O que é | Como casa com o título |
|---|---|---|
| **Retorno de cobrança** (CNAB 240 ou 400, `.ret`) | o banco lista cada boleto liquidado | pelo **nosso número** do boleto: casa exato, sem dúvida |
| **Extrato** (`.ofx`, ou CSV/PDF) | entradas na conta | por **valor e data**, às vezes pelo nome/CNPJ de quem pagou: casa por aproximação, com uma fila "confira estes" |

⚠️ **O Omie já faz conciliação bancária** (importa OFX e casa com os
títulos). Se a baixa for feita aqui e também lá, um pagamento pode ser
baixado duas vezes. Duas saídas: (a) a baixa é **só no sistema** (marca
"pago" aqui, para a cobrança; o Omie segue com a conciliação dele); ou (b) o
sistema **baixa no Omie** pela API depois da conferência, e a conciliação de
lá deixa de ser feita à mão.

✅ **Decidido pelo Pedro (20/11/2026): a baixa fica só no sistema.** O pago
marcado aqui (à mão ou pelo arquivo) serve à cobrança e aos avisos; o Omie
segue com a conciliação dele, e o sistema não grava baixa lá.

**Bancos: Sicredi e Bradesco.** O formato do arquivo ainda não foi definido:
o Pedro vai mandar um arquivo de exemplo (um mês antigo serve). Cada banco
tem o seu layout de retorno CNAB, então o leitor nasce para os dois.

✅ **Decidido pelo Pedro (20/11/2026): a cobrança acompanha só o que o
próprio sistema emitir.** Os boletos que ficaram sem baixa no Omie (a pessoa
anterior não dava baixa) não entram. Por isso a fase 2 (emissão) vem antes da
3, e cada título emitido pelo sistema guarda o código do Omie.

**As contas no Omie (lidas pela API em 20/11/2026, só leitura).** São 14
contas; ficam só as duas que cobram e estão ativas:

| `nCodCC` | Banco | Descrição no Omie | Usada em |
|---|---|---|---|
| `5960922842` | 748 Sicredi | "Sicredi" | **todos os 81 contratos ativos** (R$ 59.035,16/mês) |
| `6109178168` | 237 Bradesco | "BRADESCO *" | as OS e as DANFEs faturadas pelo sistema (`MOLDE_NFSE`/`MOLDE_NFE`) |

Ficam de fora: dois Bradesco inativos (`5964451788`, `5988516657`; este
ainda tem 2 contratos suspensos), "Sicred - Visa" (é cartão, tipo CR), a
Aplicação Bradesco, Caixa, Original, Omie.CASH, Letsbank, Justa e os caixas
internos. Ou seja, **não é escolha caso a caso**: contrato cobra no Sicredi,
OS faturada cobra no Bradesco.

Na primeira página de títulos a receber (100 de 5.692), só 11 tinham
`boleto.cGerado = S`; o resto é título sem boleto gerado pelo Omie. A
emissão da fase 2 precisa confirmar como o boleto sai (gerado pelo Omie na
conta de cobrança ou registrado no banco por fora).

### 4. Contas a pagar na Agenda

> **Primeiro pedaço, no sentido contrário (23/11/2026, migration 100):** as
> guias de tributos que o contador publica no Onvio entram em PDF e viram
> conta a pagar no Omie (o sistema grava, com `OMIE_EMISSAO`). Ver
> [guias-tributos.md](guias-tributos.md). A leitura dos vencimentos a pagar
> para a Agenda continua por fazer.

Era a fase C da [agenda.md](agenda.md): os vencimentos a pagar
(`financas/contapagar/ListarContasPagar`) entram no dia deles, com aviso do
que vence na semana.

### 5. Cadastro conferido

Comparar CNPJ, razão social e e-mail de cada prédio com o cliente do Omie e
listar o que diverge (é o que faz a nota e o envio caírem no lugar certo). ⚠️
**No banco de teste nenhum prédio tem CNPJ**: em produção, conferir antes
quantos têm, porque a fase 1 depende disso.

### 6. Caixa (vai para Relatórios)

Saldo das contas correntes e entradas/saídas do mês (extrato), recebido ×
esperado no mês, inadimplência. É o miolo do dashboard de Relatórios, que
ainda vai ser desenhado com o Pedro.

## Fora do escopo

- **Estoque** (a empresa não trabalha com estoque).
- Emitir as notas de contrato pelo sistema (nota em dobro, ver fase 2).

## Ordem proposta

**1 → 2 → 3 → 4 → 5 → 6** (mudou em 20/11/2026: a cobrança só acompanha o
que o sistema emitir, então a emissão vem antes). Era 1 → 3 → 2 → … .
Contratos ligados ao prédio são a base de tudo (o
título a receber e a nota só viram "do prédio X" com esse elo); contas a
receber é o que mais pesa para quem cuida de tudo sozinho.
