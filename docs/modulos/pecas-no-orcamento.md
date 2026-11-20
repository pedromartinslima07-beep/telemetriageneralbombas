---
tags:
  - projeto
  - fluxo
aliases:
  - Peças no orçamento
  - Catálogo de peças
  - Peça ligada ao produto do Omie
---
# Peças no orçamento: o catálogo do Omie na hora de montar (✅ fase A no código; B a D 📋, 20/11/2026)

Pedido do Pedro: *"hj a gente salva as peças no sistema?"* → *"desenha isso
pra mim"* → *"começa pela fase A"*. A **fase A está no código** (branch
`feature/admin-condominio`, sem deploy; ver "Fase A no código" no fim); B, C
e D continuam desenho. Ele parte do que já
existe para a nota fiscal ([nota-fiscal.md](nota-fiscal.md)) e o leva para o
começo do fluxo.

## Como é hoje

| Onde | Tabela | O que guarda | Ligado a produto? |
|---|---|---|---|
| O.S. (o técnico, no app) | `os_pecas` | descrição, quantidade, observação | Não. Texto livre |
| Orçamento (o escritório) | `orcamento_linhas` | descrição, ficha técnica, quantidade, valor unitário, `natureza` (090), `tipo_servico` (068) | Só na **emissão da DANFE**: `omie_produto_codigo` (091), escolhido no modal da nota |
| Catálogo | `omie_produtos` (091) | cópia dos 1.318 produtos do Omie: código, NCM, unidade, preço, **vezes faturado**, último CFOP | — |
| Memória | `omie_produto_vinculos` (091) | "esta descrição já foi o produto X" (gravada quando o Omie aceita a nota) | — |

Consequências:

1. **O orçamento é montado às cegas.** Quem digita "contator 32A" não vê que
   existem três contatores 32 A no Omie, com preço de R$ 66 a R$ 394.
2. **A peça é escolhida duas vezes.** Uma ao montar (texto), outra ao emitir
   a nota (produto). Na segunda, quem emite já não lembra o que o técnico
   quis dizer.
3. **O que o técnico usou na O.S. é redigitado** no orçamento.
4. **Não dá para contar peça.** "Quantos contatores vendemos este ano?" é
   procurar em texto livre, com grafias diferentes.

⚠️ Depende da branch `feature/nota-fiscal-omie`: as migrations **090 e 091
ainda não rodaram em produção**. Este desenho só começa depois dela no ar.

## O que muda (a ideia)

**A linha de peça nasce ligada ao produto**, no momento em que é digitada,
com a mesma busca que o modal da nota já usa (`omie-produtos.service.js`:
`buscar`, `sugerir`). A nota, depois, só confere.

### 1. Sugestão ao digitar a linha (Fase A)

No editor de itens do orçamento (tipo **Peças e serviços**), o campo da
descrição abre uma lista enquanto se digita:

- **Até 5 produtos**, do mesmo motor de pontuação da nota (palavra rara pesa
  mais, a primeira palavra pesa o triplo, medida diferente derruba, o que a
  General já faturou sobe).
- Cada sugestão mostra: **nome no Omie**, código, NCM, **preço do Omie**,
  **"faturado 37×"**, e — novo — **"última vez: R$ 128,00 no OR-000306"**
  (o preço que a própria General cobrou, lido de `orcamento_linhas` já
  aprovadas com o mesmo produto). É o número que quem orça quer ver.
- A primeira da lista é a **"usada da última vez"** quando houver vínculo em
  `omie_produto_vinculos` para aquele texto.
- Atalhos: ↑/↓ e Enter escolhem; Esc fecha e deixa o texto como está.

**Escolher um produto:**

- grava `omie_produto_codigo` e `natureza = 'peca'` na linha;
- **preenche o valor unitário se estiver vazio** (o da última vez; senão o do
  Omie). Valor já digitado **não é trocado**;
- **a descrição fica a que a pessoa escreveu** (é o que o síndico lê no PDF).
  O nome do Omie aparece embaixo, pequeno, com o código: "PRD00268 · LUVA DE
  UNIÃO 60MM · NCM 3917.40.90". Um "usar o nome do Omie" troca, se quiser.

**Não escolher continua valendo.** Linha sem produto é aceita como hoje
(peça que não está no Omie, item combinado por fora). Ela aparece com
"sem produto do Omie · escolher" e o modal da nota pede a escolha depois,
como já faz. Nada bloqueia o envio ao cliente.

**Trocar a descrição depois de escolher** não desfaz a escolha sozinho (a
pessoa pode estar só corrigindo a grafia). Um "trocar" ao lado do código
reabre a lista.

**Mão de obra** ("Mão de obra", "Visita técnica"): a linha pode ser marcada
**Serviço** ali mesmo (o mesmo `natureza` da nota). Assim a regra
"orçamento com peça sai em DANFE, com o serviço embutido" já se lê na
montagem: o trilho diz "vai sair em DANFE" ou "vai sair em NFS-e".

### 2. As peças da O.S.: usadas e a orçar (Fase B)

**Resposta do Pedro (20/11/2026): `os_pecas` guarda as duas coisas.** O
técnico registra ali tanto a peça que **usou** na visita quanto a que
**falta** e precisa de orçamento. Hoje nada separa uma da outra, e é isso que
a Fase B resolve antes de qualquer botão de "trazer".

**No banco:** `os_pecas.situacao` (`usada` | `a_orcar`, nova coluna). As
linhas que já existem ficam **NULL = não se sabe** — nada é adivinhado.

**No app do técnico** (APK novo): cada peça ganha a escolha **"Usei na
visita" / "Falta, precisa orçar"**. Marcar alguma como "falta" já liga o
"preciso de orçamento" da O.S. (`orcamento_necessario`), que hoje é um
interruptor à parte e um texto livre (`orcamento_observacoes`). O texto
continua, para o que não é peça ("o quadro está esquentando").

**No orçamento ligado à O.S.**, em cima dos itens, as peças aparecem
separadas, e cada grupo tem o seu tratamento:

**As duas vão para o orçamento** (Pedro, 20/11/2026: a peça usada na visita
é cobrada depois, por orçamento). O que muda entre elas é **como aparecem
para o cliente**, não se entram:

| Grupo | O que a tela faz | No PDF do orçamento |
|---|---|---|
| **Usadas na visita** | Botão **"Trazer as 2 peças usadas"** | Num bloco próprio, **"Peças utilizadas na visita de 19/11"**: o serviço já foi feito, o síndico está aprovando a cobrança, não a instalação |
| **A orçar** | Botão **"Trazer as 2 peças a orçar"** | No bloco de sempre, **"Peças a instalar"** |
| **Sem marcação** (antigas, NULL) | As duas opções lado a lado, "usada" ou "a orçar"; a escolha grava a `situacao` na peça e a traz | No bloco que a escolha disser |

Um botão só, **"Trazer todas as peças da O.S."**, quando os dois grupos
existem. Cada linha nasce com a descrição e a quantidade da peça (observação
na ficha técnica) e, quando há vínculo lembrado, **já com o produto do Omie
escolhido**; sem vínculo, com as sugestões abertas.

**O cuidado é não cobrar a mesma peça duas vezes**, não "usada × contrato":

- a linha guarda a origem (`orcamento_linhas.os_peca_id`, nova coluna) e a
  rota **recusa** trazer a peça que já está em outro orçamento que não foi
  recusado (orçamento recusado libera a peça para um novo);
- na O.S., cada peça passa a dizer **"orçada no OR-000072"** (ou "aprovada",
  "recusada"), e o botão de trazer conta só as que faltam;
- apagar a linha no orçamento libera a peça.

**A linha sabe de qual grupo veio** (`orcamento_linhas.peca_usada BOOLEAN`,
copiada da peça ao trazer, editável). É ela que o PDF lê para separar os dois
blocos, e não a O.S., porque a linha pode ser escrita à mão também.

- No **"Fazer orçamento"** de um pedido do técnico, as peças da O.S. (as duas
  situações) já entram sozinhas.
- Na lista de **Orçamentos**, o pedido sem documento mostra "2 usadas · 2 a
  orçar" no lugar de só o texto.
- **Orçamento só de peças usadas** é o caso comum de "cobrar o que foi
  trocado na visita": nasce da O.S. finalizada, mesmo sem o técnico ter
  marcado "preciso de orçamento". Na página da O.S., **"Cobrar as peças
  usadas"** cria o orçamento já com elas.

### 3. Contar peça (Fase C)

Com a linha ligada ao produto, a pergunta vira consulta, em dois números
diferentes (a mesma peça pode estar nos dois, e está certo):

- **Vendidas:** `orcamento_linhas` de orçamentos aprovados × `omie_produtos`,
  por produto, mês e condomínio — as usadas na visita **e** as instaladas
  depois. Peças mais vendidas, ticket médio de peça, preço cobrado × preço
  do Omie.
- **Usadas na visita (consumo):** `os_pecas` com `situacao = 'usada'`. O que
  o técnico precisa levar no carro. Só fica exato com a Fase D (peça usada
  ligada ao produto); antes disso, conta por texto.
- **Usada e não cobrada:** peça `usada` sem linha em orçamento aprovado. É
  dinheiro esquecido, e cabe na fila do **Hoje** ("3 O.S. com peças usadas
  sem cobrança → Cobrar").

Entra no **dashboard de Relatórios** (que ainda vai ser desenhado com o
Pedro).

### 4. O técnico escolhe do catálogo (Fase D, talvez)

O app do técnico usaria a mesma busca ao registrar a peça na O.S.
(`os_pecas.omie_produto_codigo`). Fica por último: é APK novo, e no 4G
de casa de máquinas a busca precisa funcionar com o catálogo baixado.

## O que muda no servidor

| Fase | Banco | Rotas |
|---|---|---|
| A | **Nada novo**: `orcamento_linhas.omie_produto_codigo` e `natureza` já existem (091/090) | `PATCH /admin/orcamentos/avulsos/linhas/:id` passa a aceitar `omie_produto_codigo` e `natureza`; `GET /admin/omie/produtos?q=` ganha `ultimo_preco` e `ultimo_orcamento` de cada produto (de `orcamento_linhas` aprovadas) e o vínculo lembrado para o texto |
| B | `os_pecas.situacao VARCHAR(10) CHECK (situacao IN ('usada','a_orcar'))` (NULL nas antigas); `orcamento_linhas.os_peca_id INTEGER REFERENCES os_pecas(id) ON DELETE SET NULL`; `orcamento_linhas.peca_usada BOOLEAN NOT NULL DEFAULT false` | `PATCH /ordens-servico/:id/pecas/:pecaId` aceita `situacao` (app e admin); `POST /admin/orcamentos/avulsos/:id/linhas/da-os` com `{ pecas: [ids] }` (cria as linhas; **409** para peça já em orçamento não recusado); `POST /ordens-servico/:id/cobrar-pecas` (orçamento novo com as usadas ainda não orçadas); o PDF do orçamento separa "utilizadas na visita" de "a instalar" por `peca_usada` |
| C | — (índice em `orcamento_linhas(omie_produto_codigo)` se ficar lento) | `GET /relatorios/pecas?de=&ate=` |
| D | `os_pecas.omie_produto_codigo` | o app lê o catálogo (rota leve, só código, nome, NCM) |

**A memória (`omie_produto_vinculos`) continua gravando só quando o Omie
aceita a nota.** A escolha feita na montagem fica na linha, mas não ensina:
é a nota que prova que aquele produto era o certo (mesma regra de 091).

## O que já se sabe da busca (catálogo real, 20/11/2026)

Testado no banco de teste com a cópia dos 1.318 produtos:

| Digitado | 1ª sugestão | Observação |
|---|---|---|
| luva de união 60mm | PRD00268 · LUVA DE UNIÃO 60MM · R$ 128 · faturado 37× | exata |
| contator 32a | 018536 · CONTATOR WEG CWM32 32A · R$ 394 (0×); PRD00135 CWB 32 A · R$ 391 (6×); 103 · CJX2 · R$ 66 (5×) | três contatores 32 A: **é por isso que a pessoa escolhe** |
| boia elétrica | PRD00258 · BOIA AUTOMÁTICA DE NÍVEL · R$ 50 · 12× | boa |
| registro de gaveta 2 | antes: 1½" DN40; DECA 110 mm. **Depois da fase A: REGISTRO 1502 AMARELO 2"; REGISTRO DECA 60MM** | o "2" sem unidade passou a contar como bitola (ver abaixo) |

## Fase A no código (20/11/2026)

### A busca entende bitola

`src/services/omie-produtos.service.js` (vale também para as sugestões do modal
da nota, que usam o mesmo motor):

- **Fração vira decimal antes de tudo.** O catálogo escreve polegada de seis
  jeitos: `2"`, `1.1/2"`, `1 1/2`, `2.1/2`, `3/4` e até `11/2` querendo dizer 1½
  (`REGISTRO DE GAVETA HD 11/2 DN40`). Todos viram `1.5`; `1/2CV` vira `0.5cv`
  (casa com "0,5CV"); fração colada em palavra (`2 1/2DECA`) se separa.
- **`2 pol`, `2 polegadas`, `2"`** viram `2pol`.
- **Número sozinho até 12 é bitola** ("registro de gaveta 2"), dos dois lados:
  o produto que declara bitola diferente perde metade; o que bate ganha 30%.
  Acima de 12 é tensão, código ou quantidade e não conta.
- **mm ↔ polegada pela tabela de PVC** que o próprio cadastro usa (20 = ½",
  25 = ¾", 32 = 1", 40 = 1¼", 50 = 1½", 60 = 2", 75 = 2½", 85 = 3", 110 = 4"):
  pedir "registro 2" penaliza o de 110 mm e acha o "REGISTRO DECA 60MM".
- **Plural em -res**: "ADAPTADORES" → adaptador.

Doze buscas conferidas no catálogo real (todas com a peça certa em 1º):
registro de gaveta 2 · registro gaveta 1.1/2 · adaptador 3/4 · luva de união
60mm · contator 32a · bomba 1/2 cv · boia elétrica · cotovelo 60mm · adaptador
lr 50mm 1.1/2 · luva 1" · adaptador 2 1/2 · cola para tubo pvc.

⚠️ `normalizar` também é a chave de `omie_produto_vinculos` (a memória da
nota). Mudar a normalização muda a chave das descrições com fração. Em
produção a tabela ainda não existe (091 não rodou); no teste estava vazia.

### As rotas

| Rota | O que mudou |
|---|---|
| `GET /admin/omie/produtos?q=&historico=1&orcamento_id=&limite=` | O modo do editor: cada produto traz `ultima_vez` (`{ valor, orcamento_id, numero, em }`, da linha mais recente de um orçamento **aprovado**, sem contar o próprio); o produto lembrado para o texto sobe com `lembrado: true`; catálogo vazio devolve lista vazia **sem** disparar a sincronização de 1 min. Sem `historico=1`, é a busca de sempre |
| `POST /admin/orcamentos/avulsos/:id/linhas` | Aceita `omie_produto_codigo` e `natureza` |
| `PATCH /admin/orcamentos/avulsos/linhas/:id` | Aceita `omie_produto_codigo` (null tira) e `natureza` (`peca`, `servico` ou vazio). Produto escolhido sem natureza vira `peca` |
| as três rotas de linha (GET, POST, PATCH) | Devolvem **o mesmo formato**, com `natureza`, `omie_produto_codigo`, `produto_codigo`, `produto_descricao`, `produto_ncm`, `produto_unidade`, `produto_inativo` (`_LINHA_SELECT`) |

Recusas: produto fora do catálogo ou inativo → **422**; natureza inválida →
**400**; **nota emitida ou processando trava produto e natureza (409)**, mas
não descrição e valor (a nota já saiu com aquelas escolhas).

⚠️ **Toda rota de linha devolve o produto.** O editor troca a linha inteira
pela resposta (`_avLinhas[idx] = j`): um PATCH de valor que devolvesse as
colunas de antes apagaria o produto da tela. É o mesmo tipo de defeito do
vínculo do orçamento com a O.S. (`orcamento-vincula-os.test.js`).

Nenhuma migration: as colunas são as da nota (090, 091).

### A tela

`public/admin-orc-pecas.js` (novo), que **decora** o editor de sempre (embrulho
em `_avRenderLinhas`); no `admin.js` só o POST do item novo mudou (manda o
produto escolhido, lido por `_avPecaPendente`).

- Digitar 3 letras na descrição (de uma linha ou do item novo) abre a lista:
  código, nome, preço do Omie, NCM, "faturado N×", **"última vez R$ X · OR-…"**
  e "usado da última vez". ↑/↓, Enter, Esc. A lista mora no `body`
  (`position: fixed`): o editor rola dentro de uma caixa.
- Escolher liga a linha e **preenche o valor só se estiver vazio** (o da
  última vez; senão o do Omie). A descrição fica a digitada.
- Em cada linha: **Peça | Serviço** (clicar no marcado desmarca; Serviço tira
  o produto), o produto com **trocar**, **usar o nome do Omie** e **tirar**,
  ou "sem produto do Omie · escolher".
- No item novo, a escolha aparece como "Vai ligado a PRD… · tirar" até o
  "+ Adicionar".
- Embaixo dos itens: **qual nota vai sair** (com peça, DANFE; só serviço,
  NFS-e; ou quantas linhas faltam marcar).
- Só no tipo **Peças e serviços**; perfil sem gravação e nota emitida veem
  sem poder mudar.

⚠️ **O redesenho recria o formulário do item novo.** Uma gravação que
chegava enquanto a pessoa digitava o item novo apagava o texto e tirava o
foco (já era assim antes; agora é nesse campo que se busca). O embrulho
guarda e devolve o texto, os números e o cursor.

### Testado (banco de teste, 20/11/2026)

- `scripts/testes/orcamento-linha-produto.test.js` (novo): **21/21** — POST e
  PATCH com produto, o PATCH de valor continuando a devolver o produto,
  tirar/pôr, natureza à mão e vazia, 422/400, trava da nota emitida (409) sem
  travar o valor, "última vez" só de aprovado e nunca do próprio orçamento,
  bitola na busca.
- `nota-fiscal-danfe.test.js`: **81/81** (o motor de sugestão mudou).
- Na tela (1900×1000 e 390×844, orçamento de teste criado e apagado):
  "Registro de gaveta 2" → 6 sugestões, Enter liga ao registro de 2" e
  preenche R$ 208; Mão de obra → Serviço; item novo "contator 32a" → ↓ Enter →
  "Vai ligado a PRD00135", R$ 391,57 → Adicionar já ligado; tudo continua
  depois do F5; redesenho no meio da digitação preserva texto e foco. Sem
  erro de JS.
- **Não testado:** o modal da nota abrindo com as linhas já ligadas (lê as
  mesmas colunas, mas não foi aberto), e com o banco de produção, onde a 091
  ainda não existe.

Versões: `admin.css?v=344`, `admin.js?v=406`, `admin-orc-pecas.js?v=3`.

## Riscos

- **Preço do Omie desatualizado.** Ele é sugestão, nunca substitui valor
  digitado; e o "última vez" (preço da própria General) vem antes.
- **Escolha errada que parece certa.** Mesmo cuidado da nota: NCM visível em
  cada sugestão, nada escolhido sozinho (só o "usado da última vez" vem
  marcado, e ainda assim visível).
- **Orçamento de limpeza/dedetização** não tem linha de peça: a sugestão não
  aparece nesses tipos.
- **Catálogo vazio ou velho** (primeira vez, Omie fora): o campo funciona
  como hoje, texto livre, com um aviso discreto "catálogo do Omie
  indisponível".

## Ordem sugerida

1. Subir a nota fiscal (090/091 em produção) — pré-requisito.
2. **Fase A** (sugestão na linha + preço da última vez + medida em polegada).
3. **Fase B** (usada / a orçar na peça da O.S., "Trazer as peças da O.S.",
   "Cobrar as peças usadas" e os dois blocos no PDF). Precisa de APK novo
   para o técnico marcar; o lado do admin (marcar as antigas, trazer, cobrar)
   funciona antes dele.
4. **Fase C** junto com o dashboard de Relatórios.
5. Fase D só se a A e a B pegarem.

Ver também: [nota-fiscal.md](nota-fiscal.md),
[ordens-servico.md](ordens-servico.md),
[redesenho-admin.md](redesenho-admin.md),
[../banco-de-dados.md](../banco-de-dados.md).
