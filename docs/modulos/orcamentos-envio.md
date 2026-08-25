---
tags:
  - projeto
  - fluxo
aliases:
  - Envio de orçamento
  - Orçamento por e-mail
---
# Fluxo: envio do orçamento por e-mail

Duas opções no modal do admin, e **cada uma tem a sua lista de destinatários**.
A diferença entre as listas é a razão de o modal existir.

## O furo que isto fechou (25/08/2026)

Até aqui o e-mail ia para **todos** os endereços de `condominios.email` e o
formato era escolhido por uma pergunta só:

```sql
SELECT 1 FROM usuarios WHERE condominio_id = $1 AND role = 'cliente' LIMIT 1
```

Num prédio com **síndico, zelador e administradora** onde só o síndico tem
login, os três recebiam o e-mail **com link e sem anexo**. O zelador e a
administradora clicavam, caíam no `/login`, digitavam o e-mail — e o código
nunca chegava, porque não têm conta. Ficavam sem o orçamento.

**O acesso de um decidia pelos outros.** E não era caso raro: nos três
orçamentos mais recentes do banco de teste, as duas listas divergem em todos.

## As duas opções

| | Pelo painel | Com carta e anexo |
|---|---|---|
| Vai para | **só quem tem login** (`usuarios` do condomínio) | os endereços informados (vêm de `condominios.email`, editáveis) |
| Lista editável? | **não** — vem do cadastro | sim |
| Corpo | fixo, da casa | mensagem escrita pelo operador |
| Assinatura | não | a do operador logado (`usuarios.assinatura_blob`) |
| Documento | link para o painel, **sem anexo** | **PDF anexo**, sem link |
| Onde a resposta é registrada | na tela do cliente | em lugar nenhum — ele responde o e-mail |

⚠️ **A lista do modo `painel` vem do banco, nunca do corpo da requisição.**
Aceitar a lista do cliente ali deixaria o envio "pelo painel" mandar link para
qualquer endereço digitado — que é exatamente o defeito que este modo existe
para fechar.

⚠️ **O modo `carta` não leva o link**, mesmo quando o condomínio tem usuários.
Quem escolheu carta escolheu anexo, e a lista dele pode incluir gente sem
conta.

⚠️ **Sem `modo` no corpo, o comportamento antigo continua valendo.** Cliente
com JS em cache não pode começar a receber erro.

## Mensagem e assinatura: saíram e voltaram

Existiram até **24/08/2026**, quando o corpo do e-mail virou fixo — a razão
está registrada: carta reescrita a cada envio é carta que uma hora sai errada
para cliente real. Voltaram em **25/08** como **metade de uma escolha**, não
como padrão: existem no modo `carta` e não existem no modo `painel`, onde o
e-mail é só o caminho até a tela.

As rotas `/admin/me/email-template` e `/admin/me/assinatura` e as colunas
`usuarios.email_mensagem` / `assinatura_blob` **nunca foram removidas** — só a
interface tinha saído. Religar foi devolver os campos ao modal.

⚠️ **A assinatura é data URI e o limite do [`CLAUDE.md`](../../CLAUDE.md) vale
aqui:** imagem embutida acima de ~100 KB faz o Gmail aparar a mensagem. Quem
redimensiona é o front, em `_avPrepararAssinatura`, antes de subir — as artes
originais da empresa têm 7-8 MB.

⚠️ **A assinatura sobe ANTES do envio.** Se subisse depois, um envio bem
sucedido com assinatura nova deixaria o padrão do operador desatualizado; se
falhasse, ele teria salvo uma imagem para um e-mail que não saiu.

## No modal

- `GET /admin/orcamentos/avulsos/:id/destinatarios` devolve as duas listas, e o
  modal **mostra as duas**: quem recebe pelo painel, e quem está no cadastro e
  ficaria de fora. Sem isso o operador teria de adivinhar a diferença.
- Sem usuário no condomínio, "Pelo painel" fica **desabilitado, não escondido**
  — sumir esconderia que existe um caminho melhor, e ninguém descobriria que
  basta criar o acesso em Clientes.

### ⚠️ No modo painel não se lista `condominios.email`

A primeira versão avisava, ali dentro: *"o condomínio tem sindico@…, portaria@…
no cadastro"*. O Pedro pegou (25/08/2026), e o problema é maior que o ruído
visual: mostrar endereços do cadastro **dentro do modo em que eles não
recebem** faz a pessoa ler uma lista em destaque e entender que o envio vai
para ela.

O que ficou é a **regra**, sem endereços — "quem não tem login não recebe por
este caminho". Quem precisa alcançar todos troca de modo, e lá os endereços
aparecem no campo "Para", que é onde de fato valem e onde dá para editar.

### ⚠️ O modal é PLACA CLARA, e isso muda as variáveis

`.modalBox` é `--chapa`. As variáveis de uso diário do admin — `--muted`
(`#8294c2`) e `--border` (branco a 14%) — são do **campo escuro**: dentro do
modal o nome sai azul-claro sobre cinza e o fio some. A dupla certa é
`--tinta` / `--tinta-2` / `--fio-esc`. É a Regra dos Dois Campos de Estado do
[`DESIGN.md`](../../DESIGN.md), e vale para tudo que nascer dentro de modal.

### ⚠️ `.f span` é rótulo de campo, não texto

Ele vem com `text-transform: uppercase`, e transformava o nome do síndico em
"EDMILSON ROCHA" e o texto do checkbox em grito. Para `span` que é conteúdo
dentro de `.f`, use `.avOpt` — mesma solução (e mesma especificidade) do
`.f span.cep-msg`, que já existia logo acima no `admin.css`.

### ⚠️ O seletor de modo não usa o amarelo

A primeira versão marcava o modo ativo com `btnAccent`, que é a classe da
**ação** — e o modal ficava com dois amarelos disputando: o modo escolhido e o
"Enviar". É um por tela, e aqui ele pertence ao "Enviar". Selecionado, em placa
clara, é tinta marinho cheia com texto claro. (De quebra, `btnAccent` dentro de
`.f` sequer pintava de amarelo: o indicador antigo mentia sobre o estado.)

## Preview sem sessão e sem enviar nada

`node scripts/preview-modal-envio.js` gera `public/_preview-envio.html`, aberto
em `/dev/_preview-envio.html` (rota que **só existe fora de produção**). O
modal exige sessão de admin e o envio dispara e-mail real; ali o `fetch` é
dublê e nada sai.

⚠️ **A função é recortada do `public/admin.js` em tempo de geração**, nunca
copiada. Preview com markup duplicado começa fiel e mente na primeira edição.

⚠️ **O JS do preview vai em arquivo separado.** O helmet manda
`script-src 'self'`: script inline é bloqueado sem aviso no console e a página
abre vazia, como se nada tivesse acontecido.

## A volta: o que acontece quando o cliente responde

Até 25/08/2026 a resposta ia para o banco e para o log, e para mais ninguém —
enquanto a tela do cliente prometia *"entramos em contato para agendar o
serviço"*. Hoje ela dispara três coisas:

1. **Grava quem decidiu** — `respondido_nome` e `respondido_cargo`, digitados
   na hora (migration 076). Ver [../banco-de-dados.md](../banco-de-dados.md).
2. **E-mail para `manutencao@generalbombas.com`** (`ORCAMENTO_RESPOSTA_EMAIL`
   sobrescreve), por `sendOrcamentoRespondido`.
3. **Acende o aviso no painel** — `resposta_vista_em` nulo vira faixa no topo
   da aba de orçamentos, e apaga quando alguém abre a ficha.

⚠️ **O e-mail fica em `try/catch` próprio.** A decisão já está gravada quando
ele sai; deixar o envio derrubar a rota faria o síndico ver "erro ao registrar
a resposta" para algo que foi registrado, clicar de novo e tomar "este
orçamento já foi respondido". O e-mail é aviso — a fonte da verdade é o banco,
e o painel mostra o não-visto de qualquer jeito.

---

Relacionados: [autenticacao.md](autenticacao.md) ·
[painel-cliente.md](painel-cliente.md) · [../api.md](../api.md)
