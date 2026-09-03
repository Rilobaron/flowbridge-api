# 🌉 FlowBridge API

<div align="center">

![FlowBridge Banner](https://img.shields.io/badge/FlowBridge-API%20Integration%20Engine-6366f1?style=for-the-badge&logo=fastapi&logoColor=white)

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express 5](https://img.shields.io/badge/Express-v5.0-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v6%2B-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-BullMQ-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![Swagger](https://img.shields.io/badge/OpenAPI-3.0-85EA2D?style=flat-square&logo=swagger&logoColor=black)](http://localhost:3000/docs)
[![Prometheus](https://img.shields.io/badge/Prometheus-Metrics-E6522C?style=flat-square&logo=prometheus&logoColor=white)](http://localhost:3000/metrics)
[![Tests](https://img.shields.io/badge/Tests-41%20Passing-brightgreen?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**O FlowBridge é uma API intermediária e genérica de integração (API Bridge) de alta resiliência, segurança e escalabilidade.**  
Ele permite receber webhooks de qualquer plataforma de origem, validar autenticação e idempotência, transformar payloads com mapeamento dinâmico de JSON, enfileirar de forma assíncrona e despachar para múltiplos destinos simultaneamente (Fan-out) com suporte a OAuth2, retries inteligentes, backoff exponencial e Dead Letter Queue.

[Funcionalidades](#-funcionalidades-chave) • [Arquitetura](#-arquitetura) • [Instalação](#-instalação--execução-rápida) • [Docker](#-executando-com-docker) • [Documentação Swagger](#-documentação-interativa-swagger) • [Endpoints](#-rotas-e-endpoints-da-api) • [Fan-out & OAuth2](#-fan-out--autenticação-oauth2) • [Exemplos cURL](#-guia-prático-com-exemplos-curl) • [Testes](#-testes-automatizados)

</div>

---

## 🚀 Funcionalidades Chave

- 🔄 **Integrações Dinâmicas (CRUD Completo):** Cadastre origens, múltiplos destinos, métodos HTTP (`POST`, `PUT`, `PATCH`, `DELETE`), cabeçalhos, timeouts e políticas de retry via API, sem alterar o código-fonte.
- ⚡ **Webhooks Assíncronos Dinâmicos:** Endpoints individuais por slug (`/api/v1/webhooks/:slug`) com resposta imediata `HTTP 202 Accepted` e processamento desacoplado em segundo plano.
- 📡 **Fan-out Nativo (Múltiplos Destinos):** Um único webhook recebido pode ser transformado e entregue concorrentemente para múltiplos sistemas externos (ex: CRM, Data Lake, Slack, ERP) com ciclo de vida e retries independentes por destino.
- 🔑 **Autenticação Outbound OAuth2 (Client Credentials):** Suporte nativo ao fluxo OAuth2 `client_credentials` com cache inteligente de tokens em memória e auto-refresh antes da expiração.
- 🛡️ **Segurança de Ponta a Ponta:**
  - **Autenticação Inbound:** `none`, `api_key`, `bearer` e `hmac` (SHA-256 com comparação em tempo constante para evitar timing attacks).
  - **Autenticação Outbound:** Injeção automática de `Bearer`, `API Key`, `Basic Auth` ou `OAuth2`.
  - **Proteção contra SSRF:** Bloqueio nativo de hosts locais (`localhost`, `127.0.0.1`), faixas de IP privadas (RFC 1918) e metadados de nuvem (`169.254.169.254`).
  - **Criptografia em Repouso:** Credenciais armazenadas com AES-256-GCM via `ENCRYPTION_KEY` e mascaramento automático de segredos nas respostas (`********`).
- 🧩 **Mapeamento Flexível de JSON:** Dot notation (`cliente.contato.email`), valores literais (`_fixed:valor`), renomeação e objetos aninhados sem `eval()` ou risco de prototype pollution.
- 🎯 **Garantia de Idempotência:** Prevenção de duplicidades via header `Idempotency-Key`, campo no payload ou hash SHA-256 automático, com índice composto único no MongoDB.
- 🔁 **Resiliência e Retries Inteligentes:**
  - Retry automático com **Exponential Backoff com Jitter** para erros temporários (408, 429, 5xx, timeouts de rede).
  - Sem retries para erros definitivos de cliente (400, 401, 403, 404, 422).
- 💀 **Dead Letter Queue & Reprocessamento:** Eventos com esgotamento de tentativas são marcados como `dead_letter`, preservando todo o histórico de tentativas e possibilitando retry manual (`POST /api/v1/events/:id/retry`).
- 📈 **Métricas de Observabilidade Prometheus:** Endpoint `/metrics` com métricas consolidadas de eventos, entregas, uso de memória heap e uptime.
- 📊 **Auditoria Granular:** Modelos `Delivery` e `DeliveryAttempt` registrando cada requisição/resposta, latência em ms, e logs estruturados Winston com correlação (`requestId` e `correlationId`).
- 🚦 **Health Check & Readiness Probes:** Endpoints `/health` e `/ready` com checagem ativa de conexões com MongoDB e Redis.
- 🔌 **Fila Híbrida Inteligente:** Suporta **BullMQ + Redis** para alta escala e inclui fallback assíncrono em memória que funciona automaticamente caso o Redis não esteja configurado.

---

## 🏗️ Arquitetura

```
Sistema A (Origem: Meta Ads, Stripe, Hubspot, ERP...)
       │
       ▼ [HTTP POST Webhook]
┌────────────────────────────────────────────────────────────────────────┐
│ FlowBridge API                                                         │
│  ├─ 1. Middlewares: Helmet, CORS, Rate Limiting & Correlation ID       │
│  ├─ 2. Autenticação Inbound: HMAC SHA-256 / API Key / Bearer           │
│  ├─ 3. Validação de Payload & Idempotency Key (MongoDB)                │
│  ├─ 4. Grava Evento ('queued') & Responde imediatamente: HTTP 202      │
│  │                                                                     │
│  ▼ [Job na Fila]                                                       │
│ Worker Assíncrono (BullMQ com Redis / Async In-Memory Fallback)        │
│  ├─ 5. Mapeamento Dinâmico de JSON (Global ou Específico por Destino)  │
│  ├─ 6. Fan-out Concorrente (Promise.allSettled)                        │
│  ├─ 7. Proteção SSRF de Destino & Autenticação (OAuth2, Bearer, Key)   │
│  ├─ 8. Execução HTTP (POST, PUT, PATCH, DELETE) com Timeout            │
│  ├─ 9. Retry Isolado com Exponential Backoff por Destino               │
│  └─ 10. Dead Letter Queue & Auditoria (Delivery & DeliveryAttempt)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼ [HTTP Request 1]                                  ▼ [HTTP Request 2]
Destino 1 (CRM: Salesforce/Hubspot)                 Destino 2 (Data Lake / BigQuery)
```

---

## 📋 Pré-requisitos

- [Node.js](https://nodejs.org/) v20.x ou superior (testado com Node.js v24)
- [MongoDB](https://www.mongodb.com/) v6.x ou superior (local ou Atlas)
- [Redis](https://redis.io/) v6.x ou superior *(opcional; sem Redis, o FlowBridge utiliza processamento assíncrono in-memory)*
- [Docker & Docker Compose](https://www.docker.com/) *(opcional)*

---

## ⚙️ Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com base no `.env.example`:

```env
# ==========================================
# Configurações do Servidor
# ==========================================
NODE_ENV=development
PORT=3000
BODY_SIZE_LIMIT=2mb
CORS_ORIGIN=*
RATE_LIMIT_MAX=1000

# ==========================================
# Banco de Dados MongoDB
# ==========================================
MONGODB_URI=mongodb://localhost:27017/flowbridge

# ==========================================
# Redis & BullMQ (Opcional - se vazio usa in-memory fallback)
# ==========================================
REDIS_URL=redis://localhost:6379
WORKER_CONCURRENCY=5

# ==========================================
# Segurança & Autenticação
# ==========================================
# Chave de API para rotas administrativas (/api/v1/integrations, /api/v1/events, etc)
ADMIN_API_KEY=sua_chave_admin_secreta_aqui

# Chave mestra de 32 bytes para criptografia AES-256-GCM dos secrets
ENCRYPTION_KEY=sua_chave_de_criptografia_secreta_aqui

# Permitir URLs locais de destino (localhost/127.0.0.1) em desenvolvimento
ALLOW_LOCAL_DESTINATIONS=true

# ==========================================
# Observabilidade e Retenção
# ==========================================
LOG_LEVEL=info
EVENT_RETENTION_DAYS=30
LOG_RETENTION_DAYS=15
```

---

## 📦 Instalação & Execução Rápida

1. **Instalar dependências:**
   ```bash
   npm install
   ```

2. **Configurar variáveis de ambiente:**
   ```bash
   cp .env.example .env
   ```

3. **Iniciar em modo de desenvolvimento (hot-reload):**
   ```bash
   npm run dev
   ```

4. **Iniciar em modo de produção:**
   ```bash
   npm start
   ```

5. **Acessar a documentação Swagger interativa:**
   Abra no navegador: `http://localhost:3000/docs`

---

## 🐳 Executando com Docker

O projeto já possui `Dockerfile` multi-stage com usuário não-root e `docker-compose.yml` pré-configurado contendo o **FlowBridge**, **MongoDB 7** e **Redis 7**.

```bash
# Iniciar todos os serviços em segundo plano
docker compose up -d

# Visualizar logs em tempo real
docker compose logs -f app

# Encerrar os serviços
docker compose down
```

---

## 📖 Documentação Interativa (Swagger) & Métricas

- **Interface Swagger UI:** [http://localhost:3000/docs](http://localhost:3000/docs)
- **JSON OpenAPI 3.0:** [http://localhost:3000/docs.json](http://localhost:3000/docs.json)
- **Métricas Prometheus:** [http://localhost:3000/metrics](http://localhost:3000/metrics)

---

## 🛣️ Rotas e Endpoints da API

### Saúde & Diagnóstico
| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/health` | Checagem de liveness da API | Pública |
| `GET` | `/ready` | Checagem de readiness (testa MongoDB e Redis) | Pública |
| `GET` | `/metrics` | Métricas no formato do Prometheus | Pública |
| `GET` | `/docs` | Documentação interativa Swagger UI | Pública |

### Gerenciamento de Integrações (CRUD)
| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `POST` | `/api/v1/integrations` | Criar nova integração (suporta 1 ou múltiplos destinos) | Admin (`X-API-Key`) |
| `GET` | `/api/v1/integrations` | Listar integrações (com paginação e busca) | Admin (`X-API-Key`) |
| `GET` | `/api/v1/integrations/:id` | Consultar integração por ID (secrets mascarados) | Admin (`X-API-Key`) |
| `PATCH` | `/api/v1/integrations/:id` | Atualizar dados da integração | Admin (`X-API-Key`) |
| `DELETE`| `/api/v1/integrations/:id` | Soft delete da integração (preserva histórico) | Admin (`X-API-Key`) |

### Webhooks Inbound
| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `POST` | `/api/v1/webhooks/:slug` | Receber webhook dinâmico (responde HTTP 202) | Definida na Integration |
| `POST` | `/webhook` | Rota legada mantida para retrocompatibilidade | Aberta |

### Eventos, Auditoria & Dead Letter
| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/api/v1/events` | Listar eventos (com filtros e paginação) | Admin (`X-API-Key`) |
| `GET` | `/api/v1/events/stats` | Estatísticas consolidadas e taxa de sucesso | Admin (`X-API-Key`) |
| `GET` | `/api/v1/events/:id` | Detalhes do evento com todas as entregas fan-out | Admin (`X-API-Key`) |
| `POST` | `/api/v1/events/:id/retry` | Reexecutar manualmente evento em Dead Letter | Admin (`X-API-Key`) |
| `GET` | `/api/v1/events/:id/logs` | Logs de auditoria do evento | Admin (`X-API-Key`) |
| `GET` | `/api/v1/logs` | Listagem geral de logs com paginação | Admin (`X-API-Key`) |

---

## 📡 Fan-out & Autenticação OAuth2

### 1. Configurando Fan-out (Múltiplos Destinos Simultâneos)
Você pode configurar uma integração com a propriedade `destinations: [...]`. Cada destino pode ter sua própria URL, método HTTP, cabeçalhos, autenticação e regras de mapeamento específicas:

```json
{
  "name": "Leads Fanout: CRM e DataLake",
  "slug": "leads-fanout",
  "destinations": [
    {
      "name": "CRM",
      "url": "https://api.crm.com/v1/leads",
      "method": "POST",
      "mapping": {
        "lead_name": "customer.name",
        "lead_email": "customer.email"
      },
      "authentication": {
        "type": "bearer",
        "token": "crm_token_123"
      }
    },
    {
      "name": "DataLake",
      "url": "https://datalake.company.com/ingest",
      "method": "POST",
      "mapping": {
        "raw_payload": "customer",
        "ingested_by": "_fixed:flowbridge"
      }
    }
  ]
}
```

### 2. Configurando Autenticação OAuth2 Outbound
No destino, defina `authentication.type` como `oauth2`. O FlowBridge fará a requisição para `tokenUrl`, extrairá o `access_token`, guardará no cache inteligente respeitando o `expires_in` e injetará automaticamente o cabeçalho `Authorization: Bearer <token>` nas chamadas ao destino:

```json
{
  "authentication": {
    "type": "oauth2",
    "tokenUrl": "https://auth.externo.com/oauth/v2/token",
    "clientId": "meu_client_id",
    "clientSecret": "meu_client_secret_super_forte",
    "scope": "read:leads write:leads"
  }
}
```

---

## 💻 Guia Prático com Exemplos cURL

### 1. Criar uma Integração com Fan-out e OAuth2
```bash
curl -X POST http://localhost:3000/api/v1/integrations \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sua_chave_admin_secreta_aqui" \
  -d '{
    "name": "Meta Ads para CRM & Analytics",
    "slug": "meta-leads",
    "source": {
      "authenticationType": "api_key",
      "secret": "webhook_secret_key_123"
    },
    "destinations": [
      {
        "name": "CRM",
        "url": "https://api.crm-exemplo.com/v1/leads",
        "method": "POST",
        "mapping": {
          "nome": "customer.name",
          "email": "customer.email",
          "canal": "_fixed:meta_ads"
        },
        "authentication": {
          "type": "oauth2",
          "tokenUrl": "https://auth.crm-exemplo.com/oauth/token",
          "clientId": "crm_client_id",
          "clientSecret": "crm_secret_key"
        }
      },
      {
        "name": "Analytics",
        "url": "https://analytics.empresa.com/events",
        "method": "POST",
        "mapping": {
          "event_type": "_fixed:lead_capture",
          "user_email": "customer.email"
        }
      }
    ]
  }'
```

### 2. Enviar Webhook (Resposta Imediata HTTP 202)
```bash
curl -X POST http://localhost:3000/api/v1/webhooks/meta-leads \
  -H "Content-Type: application/json" \
  -H "X-API-Key: webhook_secret_key_123" \
  -H "Idempotency-Key: lead-evt-uuid-001" \
  -d '{
    "customer": {
      "name": "Mariana Santos",
      "email": "mariana@exemplo.com"
    }
  }'
```

**Resposta imediata (202 Accepted):**
```json
{
  "success": true,
  "message": "Webhook recebido e enfileirado para processamento.",
  "eventId": "66d0c1e8b2f1a923d8e5a1b2",
  "status": "queued"
}
```

### 3. Consultar Evento com Todas as Entregas Fan-out
```bash
curl -X GET http://localhost:3000/api/v1/events/66d0c1e8b2f1a923d8e5a1b2 \
  -H "X-API-Key: sua_chave_admin_secreta_aqui"
```

### 4. Coletar Métricas Prometheus
```bash
curl -X GET http://localhost:3000/metrics
```

---

## 🧪 Testes Automatizados

A suíte cobre testes unitários puros e testes de integração de ponta a ponta sem requisições externas:

```bash
# Executar todos os 41 testes automatizados
npm test

# Executar cobertura de código
npm run test:coverage

# Executar linter ESLint (0 errors, 0 warnings)
npm run lint

# Formatar código com Prettier
npm run format
```

---

## 📁 Estrutura de Diretórios

```
flowbridge-api/
├── src/
│   ├── config/             # Conexões com MongoDB e Redis
│   ├── constants/          # Status, métodos HTTP e códigos de erro centralizados
│   ├── controllers/        # Controladores (Integration, Webhook, Event, Log, Health, Metrics)
│   ├── docs/               # Especificação OpenAPI 3.0 / Swagger UI
│   ├── middlewares/        # Segurança, validação Zod, autenticação admin e HMAC
│   ├── models/             # Mongoose Models (Integration, Event, Delivery, DeliveryAttempt, EventLog)
│   ├── queues/             # Gerenciador unificado de fila assíncrona (BullMQ / In-Memory)
│   ├── routes/             # Rotas versionadas sob /api/v1 e /metrics
│   ├── services/           # Regras de negócio (Mapping, Delivery, OAuth2, Encryption, SSRF, Fan-out)
│   ├── utils/              # Winston Logger estruturado, AppError, AsyncHandler
│   ├── validators/         # Schemas de validação Zod
│   ├── app.js              # Inicialização e middlewares do Express
│   └── server.js           # Ponto de entrada com Graceful Shutdown
├── tests/
│   ├── unit/               # Testes unitários puros (mapping, encryption, ssrf, retry, oauth)
│   ├── integration/        # Testes de integração (fanout, oauthOutbound, metrics, webhooks, events)
│   └── setup.js            # Setup de mocks de banco em memória para testes isolados
├── .dockerignore
├── .env.example
├── .gitignore
├── .prettierrc
├── docker-compose.yml
├── Dockerfile
├── eslint.config.js
├── package.json
└── vitest.config.js
```

---

## 📄 Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para mais informações.
