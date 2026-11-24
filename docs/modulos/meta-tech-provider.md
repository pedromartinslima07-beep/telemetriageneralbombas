---
tags:
  - projeto
  - fluxo
aliases:
  - Meta Tech Provider
  - Aprovação WhatsApp
  - Privacidade e Exclusão
---
# Meta: preparação para Tech Provider

## Situação em 24/11/2026

- Portfólio empresarial General Bombas: `2878574109191669`.
- App General Bombas Telemetria: `1164344609652756`.
- Adesão: Tech Provider independente. A verificação empresarial foi enviada e o painel mostrou **Em análise**; isso não equivale à aprovação.
- Categoria gravada: **Negócio e Páginas**.
- Ícone: marca existente `public/logo-menu.png` (1024 × 1024), enviada pela interface da Meta.
- Páginas aprovadas pelo usuário, publicadas pelo commit `8f212a8` e URLs de privacidade/exclusão salvas na Meta em 24/11/2026. As três URLs (HTMLs e CSS) responderam HTTP 200 em produção.
- Nenhuma permissão avançada foi concedida nesta preparação; nenhum token foi gerado.

## Páginas públicas preparadas

| Arquivo | URL após publicação |
|---|---|
| `app/public/privacidade.html` | `https://telemetria.generalbombas.com/app/privacidade.html` |
| `app/public/exclusao-de-dados.html` | `https://telemetria.generalbombas.com/app/exclusao-de-dados.html` |
| `app/public/privacidade.css` | estilo comum |

Usam o caminho estático público `/app` já existente em `src/app.js`.
Não criar uma liberação geral de HTML por `/static`: esse bloqueio protege
as páginas de painel. As páginas legais não carregam JavaScript, não fazem
requisições ao banco, não registram service worker e não pedem autenticação.
Navegação HTML e o prefixo `/app` já seguem rede no SW existente.

O texto descreve o uso real da Meta e OpenAI no atendimento, os dados de
telemetria/manutenção, acesso da equipe humana, fornecedores e o canal para
direitos. A configuração **padrão** de retenção das conversas encerradas é
365 dias; isso foi conferido no código de `conversas-cleanup.job.js`, **não**
na configuração efetiva de produção. Não prometer que todo registro é
apagado em 365 dias nem que o mascaramento de exportações equivale a
anonimização irreversível.

### Revisão antes da publicação

- Confirmar que `comercial@generalbombas.com`, também usado na landing,
  recebe e encaminha pedidos de privacidade. Os contratos antigos trazem
  `.com.br`; não copiar esse sufixo sem conferir.
- Confirmar o prazo de retenção efetivo, rotina de backups e os responsáveis
  por atender solicitações. As páginas não criam uma rotina automática de
  exclusão ou um cargo de encarregado.
- Revisar as responsabilidades controlador/operador para a contratação com
  clientes e as condições aplicáveis aos fornecedores.
- Publicar só a alteração revisada; o checkout já continha várias mudanças
  de outros trabalhos. Não fazer push ou deploy desse conjunto por acidente.
- Conferir as duas URLs públicas por HTTPS, sem login, e só então cadastrá-las
  na Meta. **Não cadastrar uma URL futura ou uma página inacessível.**

## Dois vídeos reais para a análise

A Meta exige evidência separada para cada permissão. A documentação aceita o
painel **API Setup** para demonstrar envio de mensagem e o **WhatsApp Manager**
para demonstrar criação de modelo. Não é necessário inventar uma interface
que o sistema ainda não oferece.
Fonte: [Meta — WhatsApp app review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review/).

### Antes de gravar

1. Usar um destinatário de teste próprio ou da equipe, autorizado e cadastrado
   na lista de teste da Meta. O usuário informou e confirmou um destinatário no chat; número validado por código no WhatsApp em 24/11/2026.
2. Preparar uma conta/número de teste do WhatsApp na Meta e abrir o WhatsApp
   do destinatário para mostrar a chegada. A criação do app não configurou
   automaticamente as variáveis `WHATSAPP_*` do Railway.
3. Confirmar acesso de admin/desenvolvedor à conta e ao app.
4. Usar dados fictícios, como **Condomínio Demonstração** e **Reservatório A**.
   Mostrar o nome do app, a ação, o resultado e o contexto na mesma gravação.
5. Ocultar tokens, chave secreta, códigos de login e conversas de clientes.
   Não fabricar mensagens, telas ou aprovações. Usar gravação de tela real,
   não uma apresentação ou sequência de screenshots.
6. Não mostrar nem alegar cadastro incorporado ou múltiplas contas de
   WhatsApp como funcionando: o gateway atual usa um número e token globais.
   A integração de clientes de outras empresas precisa ser implementada e
   validada antes de operar em escala como Tech Provider.

### Vídeo 1 — `whatsapp_business_messaging`

Sugestão: 45–90 segundos, suficiente para mostrar o fluxo completo.

1. Mostrar o app **General Bombas Telemetria** e a conta/número de teste.
2. Se a integração com a central já estiver funcionando, abrir uma conversa
   de teste na central e enviar uma resposta. Como alternativa aceita pela
   Meta, usar o envio demonstrativo do painel **API Setup**.
3. Mensagem de teste, quando for texto livre dentro da janela permitida:
   **Olá! Esta é uma demonstração do atendimento da General Bombas.
   Sua solicitação de manutenção foi recebida.**
   Fora da janela, usar um modelo permitido no ambiente de teste, como o
   `hello_world` disponível no painel, sem tentar forçar texto livre.
4. Mostrar a resposta de sucesso e, no WhatsApp do destinatário, a mensagem
   recebida. Deixar o texto legível por alguns segundos.
5. Se a central estiver ligada, mostrar também a resposta do destinatário
   chegando na central. Não alegar um recebimento que ainda não foi testado.

Narração sugerida:

> Este é o General Bombas Telemetria. Usamos o WhatsApp para atender solicitações
> de manutenção e comunicar ocorrências operacionais. Nesta conta de teste,
> vou enviar uma mensagem a um número autorizado. A mensagem foi aceita pela
> plataforma e apareceu no WhatsApp do destinatário.

Texto-base para o pedido da permissão — usar somente com a gravação real:

> General Bombas Telemetria provides WhatsApp customer support for building
> maintenance and water-system monitoring. We request whatsapp_business_messaging
> to receive customer requests and send service replies and operational
> notifications from an authorized WhatsApp business phone number. The recording
> shows a real message being sent and received by our authorized test recipient.
> We do not request access to unrelated business assets.

### Vídeo 2 — `whatsapp_business_management`

Sugestão: 60–120 segundos, em arquivo separado.

1. Mostrar o app/conta e abrir **WhatsApp Manager → Modelos de mensagem**.
2. Criar um modelo de **Utilidade**, idioma **Português (Brasil)**.
3. Nome: `alerta_sensor_sem_comunicacao`.
4. Corpo:

> Alerta automático — {{1}}: o sensor do {{2}} parou de enviar leituras.
> Um chamado foi aberto e nossa equipe já foi avisada.

5. Exemplos: `{{1}}` = **Condomínio Demonstração**;
   `{{2}}` = **Reservatório A**. Não usar dados reais de cliente.
6. Revisar e enviar o modelo; mostrar o registro na lista com seu status real.
   **Em análise** é diferente de **Aprovado**.
7. Não enviar a mesma criação repetidamente se o modelo já existir.
   Se já existir, demonstrar uma criação legítima de um modelo de teste com
   nome distinto e conteúdo de utilidade que corresponda ao uso pretendido.

Narração sugerida:

> Neste fluxo gerenciamos um modelo de aviso operacional. Seleciono Utilidade
> e Português do Brasil, preencho o texto e adiciono exemplos fictícios. Envio
> o modelo para análise e mostro o registro criado no WhatsApp Manager.

Texto-base para o pedido da permissão — usar somente com a gravação real:

> We request whatsapp_business_management to manage the WhatsApp business assets
> and message templates needed for our maintenance-support service. Templates
> are used for operational notifications, such as a monitoring sensor losing
> communication. The recording demonstrates creating a utility message template
> in WhatsApp Manager with fictional sample parameters and shows its resulting
> review status. Access is limited to assets explicitly authorized by the business.

### Ligar o aviso ao backend depois da aprovação do modelo

- `WHATSAPP_TEMPLATE_SENSOR=alerta_sensor_sem_comunicacao`
- `WHATSAPP_TEMPLATE_IDIOMA=pt_BR`
- Completar `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e
  `WHATSAPP_VERIFY_TOKEN` pelo fluxo seguro de credenciais.
- Conferir o webhook de produção `/whatsapp/webhook` e a assinatura dos
  eventos antes de conectar tráfego real. O controller atual valida o desafio
  GET, mas o POST não valida a assinatura `X-Hub-Signature-256`.
- O gateway ainda fixa Graph API `v20.0`; conferir uma versão suportada na
  documentação atual antes da ligação em produção.
- Nenhuma dessas variáveis foi alterada nesta preparação.

## Critério de conclusão

A aprovação como Tech Provider depende de **verificação empresarial,
configurações públicas válidas, vídeos reais, análise das permissões e demais
verificações que a Meta apresentar**. Não marcar a etapa como aprovada apenas
porque o app foi criado ou porque um pedido está em análise.

## Fontes

- [Meta — Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers/)
- [Meta — Basic Settings](https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/basic-settings)
- [ANPD — Direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares)
- [LGPD — texto da lei](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)

Relacionados: [WhatsApp e IA](whatsapp-ia.md), [API](../api.md),
[estado atual](../../memory-bank/current-state.md) e
[trabalho em andamento](../../memory-bank/active-work.md).

## Validação local desta entrega

As páginas de privacidade e exclusão, o CSS, a fonte e o logo responderam HTTP 200 em um servidor local restrito aos arquivos estáticos, sem carregar banco ou jobs do sistema. As duas páginas foram abertas no navegador, a navegação entre elas funcionou e a política foi inspecionada visualmente. Arquivos sem scripts ou campos provisórios; âncoras internas conferidas. O ícone persistiu na Meta após recarregar o painel, que passou a apontar somente a URL de privacidade como pendência básica. Publicação e cadastro do destinatário foram concluídos. Vídeos e envio real da mensagem continuam pendentes da autorização restrita à conta de teste.

## Publicação e teste — avanço confirmado em 24/11/2026

- Commit de produção `8f212a8`: somente três arquivos legais e os dois links no rodapé. Demais alterações locais de outros trabalhos não foram incluídas.
- URLs de privacidade e exclusão conferidas por HTTPS e cadastradas na Meta, com a confirmação As alterações foram salvas.
- Termos do WhatsApp Business e Cloud API aceitos com autorização do usuário; número de teste Meta +1 (555) 168-4010, Phone Number ID `1497516756776458`; Test Messaging Account `2213340445927035`.
- Destinatário próprio informado pelo usuário validado por código. O código não é armazenado na documentação.
- A geração do token está na tela final de consentimento. Selecionada apenas Test Messaging Account e somente contas atuais. Aguardando autorização específica para Salvar, conceder gerenciamento/conversas e aceitar os Termos de Tecnologia. Nenhum token foi gerado ainda e nenhuma mensagem de demonstração foi enviada.
- Próximos: concluir consentimento, enviar mensagem, conferir recebimento real, preparar criação de modelo e gravar os dois fluxos. Verificação empresarial e análise das permissões continuam separadas da confirmação do destinatário.
