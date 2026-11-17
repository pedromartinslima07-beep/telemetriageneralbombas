---
tags:
  - projeto
  - fluxo
aliases:
  - Nota fiscal
  - NFS-e
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
| qualquer peça | **só DANFE** (NF-e), com o serviço **embutido no preço das peças** (rateio proporcional, prévia antes) | Pedido de venda → `FaturarPedidoVenda` | 📋 etapa 3 |

Mesmo com serviço junto, orçamento com peça **não** gera NFS-e. Foi decisão do
Pedro, não limitação técnica.

## Peça ou serviço: quem decide é quem emite

A linha do orçamento é texto livre ("Bomba Thebe 2cv", "MÃO DE OBRA
ESPECIALIZADA", "CONSERTO Mod: ..."), e até a migration 090 nada dizia o que
ela era. Hoje existe `orcamento_linhas.natureza` (`servico`|`peca`|NULL).

- O modal **sugere** pelo texto (`sugerirNatureza`: conserto, mão de obra,
  manutenção, instalação, limpeza… é serviço; o resto, peça). A linha
  aparece marcada como "sugerido".
- **Sugestão não emite.** O backend recusa (422) se alguma linha cobrável
  chegar sem natureza confirmada. O clique em Emitir manda a classificação
  inteira, e ela é gravada **antes** de qualquer chamada ao Omie, para valer
  mesmo que a emissão falhe adiante.
- Linha sem preço (`valor_unitario` NULL, migration 062) não entra na nota.

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

## Valor manual: rateio

Se o orçamento tem total manual (`orcamentos.valor`, que sobrepõe a soma no
PDF), a nota precisa fechar nele. `ratear()` distribui o total entre as
linhas na proporção de cada uma, e o centavo que sobra vai para a última.
A prévia avisa quando houve rateio. É a mesma função que a etapa 3 vai usar
para embutir o serviço nas peças.

⚠️ **Quantidade maior que 1 que não divide em centavos.** A linha vai com
quantidade 1 e o texto "N un. — descrição". Um unitário de 3 casas viraria
centavo fantasma na soma.

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

- `cCodIntOS = ORC-<id>`, determinístico. Antes de criar, `ConsultarOS` por
  ele: uma OS criada numa tentativa que caiu é **achada**, não duplicada. Duas
  OS seriam duas notas.
- **Trava** no `UPDATE ... WHERE nota_status IS NULL OR 'erro'` contra clique
  duplo e duas abas. Um `processando` sem OS e parado há mais de 5 minutos é
  emissão que morreu no meio (deploy, queda) e pode ser retomado.
- `FaturarOS` só roda se `StatusOS.cFaturada` não for `S`.

## Depois do faturamento

A prefeitura processa o RPS por conta própria, e o número da nota pode não
existir no instante em que a rota responde. Daí `nota_status`:

| status | quando |
|---|---|
| `processando` | faturou e o número ainda não voltou. O botão **Atualizar** relê |
| `emitida` | `StatusOS` com `cFaturada S` e `ListaRpsNfse[0].nNfse`. Grava número e `cUrlNfse` (consulta pública nfse.gov.br) |
| `erro` | exceção na emissão, ou mensagens da prefeitura sem número. Texto em `nota_erro`; o trilho mostra **Tentar de novo** |
| `cancelada` | `cCancelada S` (cancelada no Omie). Reemitir pelo sistema é bloqueado: o `ORC-<id>` já pertence à OS cancelada |

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
- **DANFE** (etapa 3), ver [roadmap](../../memory-bank/roadmap.md).
- Enviar a nota por e-mail junto com o orçamento.

---

Relacionados: [orcamentos-envio.md](orcamentos-envio.md) ·
[ordens-servico.md](ordens-servico.md) · [../banco-de-dados.md](../banco-de-dados.md) ·
[../api.md](../api.md)
