# 🌉 FlowBridge API

<div align="center">

![FlowBridge Banner](https://img.shields.io/badge/FlowBridge-API%20Integration%20Engine-6366f1?style=for-the-badge&logo=fastapi&logoColor=white)

[![CI](https://github.com/Rilobaron/flowbridge-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Rilobaron/flowbridge-api/actions)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express 5](https://img.shields.io/badge/Express-v5.0-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v6%2B-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-BullMQ-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![Swagger](https://img.shields.io/badge/OpenAPI-3.0-85EA2D?style=flat-square&logo=swagger&logoColor=black)](http://localhost:3000/docs)
[![Prometheus](https://img.shields.io/badge/Prometheus-Metrics-E6522C?style=flat-square&logo=prometheus&logoColor=white)](http://localhost:3000/metrics)
[![Tests](https://img.shields.io/badge/Tests-52%20Passing-brightgreen?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**O FlowBridge é uma API intermediária e genérica de integração (API Bridge) de nível corporativo, alta resiliência, segurança e escalabilidade.**  
Ele permite receber webhooks de qualquer plataforma de origem, filtrar dados por regras de negócio, validar autenticação e idempotência, transformar payloads com mapeamento dinâmico de JSON, enfileirar de forma assíncrona e despachar para múltiplos destinos simultaneamente (Fan-out) com suporte a OAuth2, retries inteligentes com backoff exponencial, Dead Letter Queue e alertas automáticos de falha para Slack/Discord.

[Funcionalidades](#-funcionalidades-chave) • [Arquitetura](#-arquitetura) • [Instalação](#-instalação--execução-rápida) • [Docker](#-executando-com-docker) • [Documentação Swagger](#-documentação-interativa-swagger) • [Endpoints](#-rotas-e-endpoints-da-api) • [Filtros & Alertas](#-filtros-condicionais--alertas-de-dead-letter) • [Exemplos cURL](#-guia-prático-com-exemplos-curl) • [Testes](#-testes-automatizados)

</div>

---

## 🚀 Funcionalidades Chave

- 🔄 **Integrações Dinâmicas (CRUD Completo):** Cadastre origens, múltiplos destinos, métodos HTTP (`POST`, `PUT`, `PATCH`, `DELETE`), cabeçalhos, timeouts, regras de filtro e políticas de retry via API.
- ⚡ **Webhooks Assíncronos Dinâmicos:** Endpoints individuais por slug (`/api/v1/webhooks/:slug`) com resposta imediata `HTTP 202 Accepted` e processamento desacoplado em segundo plano.
- 🚦 **Filtros Condicionais de Eventos (Rules Engine):** Regras dinâmicas para encaminhar apenas webhooks qualificados (ex: `amount > 100`, `country == "BR"`, `plan in ["pro", "enterprise"]`), marcando eventos não qualificados como `skipped` e evitando chamadas HTTP desnecessárias.
- 📡 **Fan-out Nativo (Múltiplos Destinos):** Um único webhook recebido pode ser transformado e entregue concorrentemente para múltiplos sistemas externos (ex: CRM, Data Lake, Slack, ERP) com ciclo de vida e retries independentes por destino.
- 🔑 **Autenticação Outbound OAuth2 (Client Credentials):** Suporte nativo ao fluxo OAuth2 `client_credentials` com cache inteligente de tokens em memória e auto-refresh antes da expiração.
- 🚨 **Alertas Automáticos de Dead Letter:** Notificação automática para Slack, Discord ou Webhook genérico quando um evento esgota todas as tentativas de retry e vai para Dead Letter.
- 🤖 **CI/CD Automatizado com GitHub Actions:** Pipeline configurado em `.github/workflows/ci.yml` executando linters e testes unitários/integração automaticamente a cada commit ou pull request.
- 🛡️ **Segurança de Ponta a Ponta:**
  - **Autenticação Inbound:** `none`, `api_key`, `bearer` e `hmac` (SHA-256 com comparação em tempo constante).
  - **Autenticação Outbound:** Injeção automática de `Bearer`, `API Key`, `Basic Auth` ou `OAuth2`.
  - **Proteção contra SSRF:** Bloqueio nativo de hosts locais (`localhost`, `127.0.0.1`), faixas de IP privadas (RFC 1918) e metadados de nuvem (`169.254.169.254`).
  - **Criptografia em Repouso:** Credenciais armazenadas com AES-256-GCM via `ENCRYPTION_KEY` e mascaramento automático de segredos nas respostas (`********`).
- 🧩 **Mapeamento Flexível de JSON:** Dot notation (`cliente.contato.email`), valores literais (`_fixed:valor`), renomeação e objetos aninhados sem `eval()` ou risco de prototype pollution.
- 🎯 **Garantia de Idempotência:** Prevenção de duplicidades via header `Idempotency-Key`, campo no payload ou hash SHA-256 automático, com índice composto único no MongoDB.
- 🔁 **Resiliência e Retries Inteligentes:**
  - Retry automático com **Exponential Backoff com Jitter** para erros temporários (408, 429, 5xx, timeouts de rede).
  - Sem retries para erros definitivos de cliente (400, 401, 403, 404, 422).
- 💀 **Dead Letter Queue & Reprocessamento:** Eventos com falhas definitivas assumem status `dead_letter`, preservando todo o histórico de tentativas e possibilitando retry manual (`POST /api/v1/events/:id/retry`).
- 📈 **Métricas de Observabilidade Prometheus:** Endpoint `/metrics` com métricas consolidadas de eventos, entregas, uso de memória heap e uptime.
- 📊 **Auditoria Granular:** Modelos `Delivery` e `DeliveryAttempt` registrando cada requisição/resposta, latência em ms, e logs estruturados Winston com correlação (`requestId` e `correlationId`).
- 🚦 **Health Check & Readiness Probes:** Endpoints `/health` e `/ready` com checagem ativa de conexões com MongoDB e Redis.

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
│  ├─ 5. Avaliação de Filtros Condicionais (Status 'skipped' se falhar)  │
│  ├─ 6. Mapeamento Dinâmico de JSON (Global ou por Destino)             │
│  ├─ 7. Fan-out Concorrente (Promise.allSettled)                        │
│  ├─ 8. Proteção SSRF de Destino & Autenticação (OAuth2, Bearer, Key)   │
│  ├─ 9. Execução HTTP (POST, PUT, PATCH, DELETE) com Timeout            │
│  ├─ 10. Retry Isolado com Exponential Backoff por Destino              │
│  └─ 11. Dead Letter Queue & Disparo de Alerta (Slack / Discord)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼ [HTTP Request 1]                                  ▼ [Alerta Dead Letter]
Destino (CRM: Salesforce / Hubspot)                 Canal de Notificação (Slack / Discord)
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
# Servidor HTTP
NODE_ENV=development
PORT=3000
BODY_SIZE_LIMIT=2mb
CORS_ORIGIN=*
RATE_LIMIT_MAX=1000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/flowbridge

# Redis & BullMQ (Opcional - se vazio usa in-memory fallback)
REDIS_URL=redis://localhost:6379
WORKER_CONCURRENCY=5

# Segurança & Autenticação
ADMIN_API_KEY=sua_chave_admin_secreta_aqui
ENCRYPTION_KEY=sua_chave_de_criptografia_secreta_aqui
ALLOW_LOCAL_DESTINATIONS=true

# Alertas Globais (Opcional)
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T000/B000/XXXX

# Observabilidade e Retenção
LOG_LEVEL=info
EVENT_RETENTION_DAYS=30
LOG_RETENTION_DAYS=15
```

---

## 🚦 Filtros Condicionais & Alertas de Dead Letter

### 1. Filtros Condicionais de Eventos
Você pode definir regras para que destinos específicos (ou toda a integração) só processem webhooks que correspondam aos critérios:

```json
{
  "name": "Leads Qualificados para CRM",
  "slug": "leads-crm",
  "filter": {
    "logic": "and",
    "conditions": [
      { "field": "lead.score", "operator": "greater_than_or_equal", "value": 70 },
      { "field": "lead.country", "operator": "in", "value": ["BR", "US", "PT"] },
      { "field": "lead.email", "operator": "contains", "value": "@" }
    ]
  },
  "destinations": [
    {
      "url": "https://api.crm.com/v1/leads",
      "method": "POST"
    }
  ]
}
```
*Se um lead com `lead.score: 40` for recebido, a entrega é marcada como `skipped` no banco de dados e nenhuma requisição HTTP externa é disparada!*

### 2. Alertas Automáticos de Dead Letter
Adicione a propriedade `alertWebhookUrl` na integração (ou configure `ALERT_WEBHOOK_URL` no `.env`). Se um evento esgotar todas as tentativas de retry, uma notificação formatada será enviada automaticamente para o canal:

```json
{
  "alertWebhookUrl": "https://hooks.slack.com/services/T00/B00/MEU_WEBHOOK_SLACK"
}
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
| `POST` | `/api/v1/integrations` | Criar integração (suporta múltiplos destinos, filtros e alertas) | Admin (`X-API-Key`) |
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

## 💻 Guia Prático com Exemplos cURL

### 1. Criar uma Integração com Filtros, Fan-out e Alerta
```bash
curl -X POST http://localhost:3000/api/v1/integrations \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sua_chave_admin_secreta_aqui" \
  -d '{
    "name": "Leads E-commerce com Filtro e Alertas",
    "slug": "ecommerce-leads",
    "alertWebhookUrl": "https://hooks.slack.com/services/T00/B00/XXXX",
    "source": {
      "authenticationType": "api_key",
      "secret": "webhook_secret_key_123"
    },
    "filter": {
      "customer.country": "BR"
    },
    "destinations": [
      {
        "name": "CRM",
        "url": "https://api.crm-exemplo.com/v1/leads",
        "method": "POST",
        "mapping": {
          "nome": "customer.name",
          "email": "customer.email"
        },
        "authentication": {
          "type": "bearer",
          "token": "crm_bearer_token"
        }
      }
    ],
    "retryPolicy": {
      "maxAttempts": 3,
      "initialDelay": 1000
    }
  }'
```

### 2. Enviar Webhook (Resposta Imediata HTTP 202)
```bash
curl -X POST http://localhost:3000/api/v1/webhooks/ecommerce-leads \
  -H "Content-Type: application/json" \
  -H "X-API-Key: webhook_secret_key_123" \
  -H "Idempotency-Key: lead-evt-uuid-999" \
  -d '{
    "customer": {
      "name": "Juliana Lima",
      "email": "juliana@exemplo.com",
      "country": "BR"
    }
  }'
```

---

## 🧪 Testes Automatizados

A suíte cobre 52 testes unitários e de integração de ponta a ponta:

```bash
# Executar todos os 52 testes automatizados
npm test

# Executar cobertura de código
npm run test:coverage

# Executar linter ESLint (0 errors, 0 warnings)
npm run lint

# Formatar código com Prettier
npm run format
```

---

## 📄 Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para mais informações.
