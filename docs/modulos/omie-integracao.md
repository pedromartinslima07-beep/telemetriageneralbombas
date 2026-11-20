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
> painel tem o prédio (ou o motivo de não ter), "Ligar a este prédio" com o
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
> primeira volta do job em produção, depois do deploy. ⚠️ **096 em produção
> antes do push.** Se os prédios de produção não tiverem CNPJ, todos os
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

### 2. O faturamento do dia 1

- Já existe: "Faturar contratos no Omie: 77 de 81" na Agenda. Vira uma tela
  do mês: **quem foi faturado, quem não foi e por quê** (vigência vencida,
  contrato pausado, nota rejeitada), com o número da nota e o PDF.
- ⚠️ **O sistema não emite essas notas.** Quem emite é o faturamento de
  contratos do próprio Omie; emitir dos dois lados dá nota em dobro. Se a API
  deixar **disparar o faturamento do contrato** pelo Omie, o botão "faturar os
  que faltam" manda o Omie fazer. A confirmar no levantamento.
- Notas por prédio na página dele (contrato e avulsas), com o link do PDF.

### 3. Contas a receber: quem pagou, quem atrasou

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

### 4. Contas a pagar na Agenda

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

1 → 3 → 2 → 4 → 5 → 6. Contratos ligados ao prédio são a base de tudo (o
título a receber e a nota só viram "do prédio X" com esse elo); contas a
receber é o que mais pesa para quem cuida de tudo sozinho.
