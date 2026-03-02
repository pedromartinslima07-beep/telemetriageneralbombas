#  Telemetria General Bombas

Plataforma Fullstack de monitoramento remoto de reservatórios e bombas
hidráulicas para condomínios.

O sistema permite monitoramento em tempo real, geração automática de
alertas e visualização através de painel administrativo e painel do
cliente.

------------------------------------------------------------------------

##  Visão Geral

A plataforma é composta por:

-   Backend (Node.js + Express + PostgreSQL)
-   Painel Web Administrativo
-   Painel Web do Cliente
-   Sistema automático de alertas
-   Sistema automático de detecção de dispositivo offline
-   Simulador de dispositivos para testes

É um MVP funcional completo, pronto para operação e expansão.

------------------------------------------------------------------------

##  Arquitetura

###  Backend

-   Node.js
-   Express
-   PostgreSQL
-   JWT (autenticação)
-   Helmet (segurança)
-   Rate Limit
-   Estrutura modular (routes, services, jobs)

###  Frontend

Implementado em HTML + CSS + JavaScript puro.

Localizado na pasta:

    public/

Contém:

-   Painel Administrativo
-   Painel do Cliente
-   Integração direta com API REST

------------------------------------------------------------------------

##  Banco de Dados

Principais tabelas:

-   condominios
-   reservatorios
-   leituras
-   alertas
-   usuarios

Relacionamentos:

Condomínio → possui → Reservatórios\
Reservatório → gera → Leituras\
Leituras → podem gerar → Alertas

------------------------------------------------------------------------

##  Sistema de Autenticação

-   Login via JWT
-   Perfis:
    -   admin → acesso total
    -   cliente → acesso apenas ao próprio condomínio
-   Proteção de rotas via middleware

------------------------------------------------------------------------

##  Fluxo da Telemetria

1.  Dispositivo envia:
    -   device_id
    -   nível (%)
    -   bomba_ligada
2.  API valida device_key via header `x-device-key`
3.  Salva leitura
4.  Atualiza last_seen
5.  Aplica regras de alerta
6.  Retorna status

------------------------------------------------------------------------

##  Sistema de Offline Automático

Job periódico que:

-   Verifica última leitura de cada reservatório
-   Calcula tempo sem atualização
-   Gera alerta automático se ultrapassar OFFLINE_MINUTES

------------------------------------------------------------------------

##  Painel Administrativo

Permite:

-   Cadastro de condomínios
-   Cadastro de reservatórios
-   Visualização geral do sistema
-   Acompanhamento de status
-   Gerenciamento de alertas

------------------------------------------------------------------------

##  Painel do Cliente

Permite:

-   Visualização do próprio condomínio
-   Status dos reservatórios
-   Nível atual
-   Status da bomba
-   Indicador de offline
-   Alertas abertos

------------------------------------------------------------------------

##  Como Rodar o Projeto

### 1️⃣ Clonar

    git clone https://github.com/pedromartinslima07-beep/telemetriageneralbombas.git
    cd telemetriageneralbombas

### 2️⃣ Instalar dependências

    npm install

### 3️⃣ Configurar .env

Criar arquivo `.env` na raiz:

    PORT=3001
    DATABASE_URL=postgres://usuario:senha@localhost:5432/telemetria
    JWT_SECRET=sua_chave_super_secreta
    OFFLINE_MINUTES=15

 Nunca subir o .env para o GitHub.

------------------------------------------------------------------------

### 4️⃣ Criar banco

Executar:

    database/schema.sql

no PostgreSQL.

------------------------------------------------------------------------

### 5️⃣ Rodar API

    npm run dev

ou

    node server.js

------------------------------------------------------------------------

### 6️⃣ Rodar simulador

    node simulador.js

------------------------------------------------------------------------

## 📊 Status Atual do Projeto

Plataforma Fullstack funcional contendo:

-   Backend estruturado
-   Sistema de autenticação por perfil
-   Sistema automático de alertas
-   Sistema automático de offline
-   Simulador de dispositivo
-   Painel Administrativo
-   Painel do Cliente

Pronto para:

-   Deploy em VPS ou Cloud
-   Expansão para múltiplos condomínios
-   Implementação de notificações (WhatsApp / Email)
-   Evolução para modelo SaaS

------------------------------------------------------------------------

## 👨‍💻 Desenvolvedor

Pedro Martins\
General Bombas -- Engenharia da Manutenção
