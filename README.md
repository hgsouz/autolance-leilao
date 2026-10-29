# AutoLance — Casa de leilões online de carros

Teste técnico **Elite Dev na Verzel**. Um leiloeiro monta lotes a partir de veículos buscados numa **API pública** (Tabela FIPE), licitantes depositam saldo simulado, dão lances ao vivo e, se vencerem, recebem um comprovante compartilhável. Qualquer pessoa, sem login, pode **auditar** o histórico de lances de um lote.

> Monorepo com dois projetos: [`api/`](api) (back-end) e [`web/`](web) (front-end).

## Sumário

1. [Stack](#stack)
2. [Como rodar](#como-rodar) (Docker ou manual)
3. [Contas e dados de demonstração](#contas-e-dados-de-demonstração)
4. [Variáveis de ambiente](#variáveis-de-ambiente)
5. [Testes](#testes)
6. [Deploy](#deploy)
7. [Como cada requisito foi resolvido](#como-cada-requisito-foi-resolvido)
8. [Histórico à prova de adulteração (a técnica)](#histórico-à-prova-de-adulteração-a-técnica)
9. [Comportamentos que podem surpreender](#comportamentos-que-podem-surpreender)
10. [Limitações conhecidas](#limitações-conhecidas)
11. [Uso de IA](#uso-de-ia)
12. [Estrutura do projeto](#estrutura-do-projeto)

---

## Stack

| Camada    | Tecnologias                                                            |
| --------- | ---------------------------------------------------------------------- |
| Front-end | React 19, Vite, Tailwind CSS 4, TypeScript                             |
| Back-end  | Node.js 22, TypeScript, Fastify 5, Knex.js, JWT (`@fastify/jwt`), tsup |
| Banco     | **PostgreSQL 16** (relacional)                                         |
| Testes    | Vitest (rodam contra um PostgreSQL de verdade, sem mocks de banco)     |

**Bibliotecas adicionadas além das pedidas** (todas pequenas e com função clara):

- **API:** `zod` (validação do corpo/query das requisições), `bcryptjs` (hash de senha), `pg` (driver do Knex), `dotenv`, `@fastify/cors`, `tsx` (rodar TypeScript em desenvolvimento), `vitest`.
- **Front:** `react-router-dom` (rotas), `@tanstack/react-query` (cache e atualização de dados), `lucide-react` (ícones).

**Item leiloado:** carros, vindos da API pública **Tabela FIPE** (`https://fipe.parallelum.com.br/api/v2`, gratuita, sem chave para uso básico).

---

## Como rodar

### Opção A — Docker Compose (recomendada)

Requer Docker.

```bash
docker compose up --build
```

- Front: <http://localhost:8080>
- API: <http://localhost:3333> (`/health`)
- Banco: `localhost:5433` (usuário `postgres`, senha `postgres`, base `leilao`)

Na primeira subida a API aplica as _migrations_ e cria os dados de demonstração sozinha (`AUTO_MIGRATE` e `AUTO_SEED`). Para recomeçar do zero: `docker compose down -v`.

### Opção B — Manual

Requer **Node.js 20+** (testado com 22) e **PostgreSQL 14+** rodando.

**1. Banco** — crie a base (ajuste usuário/senha ao seu Postgres):

```bash
createdb -U postgres leilao
# ou: psql -U postgres -c "create database leilao"
```

**2. API**

```bash
cd api
cp .env.example .env        # ajuste DATABASE_URL se necessário
npm install
npm run dev                 # http://localhost:3333
```

Ao subir, a API aplica as migrations e (com `AUTO_SEED=true`, já no `.env.example`) cria os dados de demonstração se o banco estiver vazio. Também é possível rodar manualmente:

```bash
npm run db:migrate          # só as migrations
npm run db:seed             # só o seed (ignora se já existir)
npm run db:reset            # APAGA tudo, recria e popula
```

**3. Front**

```bash
cd web
cp .env.example .env        # VITE_API_URL=http://localhost:3333
npm install
npm run dev                 # http://localhost:5173
```

**Build de produção** (opcional): `npm run build` em cada pasta. A API gera `dist/` via **tsup** e roda com `npm start`; o front gera `dist/` estático.

---

## Contas e dados de demonstração

Senha de todas: **`Senha@123`**. A tela de login tem botões de acesso rápido a elas.

| Perfil                | E-mail                 |
| --------------------- | ---------------------- |
| Leiloeiro             | `leiloeiro@leilao.dev` |
| Cliente 1 (licitante) | `cliente1@leilao.dev`  |
| Cliente 2 (licitante) | `cliente2@leilao.dev`  |

O seed cria: o leiloeiro, os dois clientes com saldo depositado (R$ 400.000 cada) e **9 lotes** em todas as fases:

- **4 ao vivo**, 3 deles com lances abertos (Corolla, Civic, Onix) e 1 sem lances (Compass);
- **2 agendados** (Creta, BMW 320i);
- **1 encerrado e arrematado** (Toro, com comprovante);
- **1 encerrado sem lances** (Gol);
- **1 cancelado** (Ranger, não aparece na vitrine).

Os horários do seed são relativos ao momento em que ele roda, então os lotes ao vivo ficam abertos por dias.

**Roteiro sugerido (5 minutos):** entre como Cliente 1 numa aba e como Cliente 2 numa janela anônima → abra o mesmo lote ao vivo → dê um lance com o Cliente 2 e veja o Cliente 1 passar a "Você foi superado" **sem recarregar** → entre como leiloeiro, crie um lote a partir da API e cancele-o → abra `/auditoria/<id>` de qualquer lote sem login.

---

## Variáveis de ambiente

### API (`api/.env`)

| Variável                                               | Padrão                                               | Descrição                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                         | `postgres://postgres:postgres@localhost:5432/leilao` | Conexão PostgreSQL                                                                                             |
| `DATABASE_SSL`                                         | `false`                                              | `true` em provedores que exigem SSL (Neon, Supabase…)                                                          |
| `JWT_SECRET`                                           | _(dev)_                                              | Assina os tokens. **Obrigatório trocar em produção** (mín. 16 caracteres)                                      |
| `CHAIN_SECRET`                                         | _(dev)_                                              | Chave do HMAC que sela o histórico de lances. **Obrigatório trocar em produção** e **não pode ficar no banco** |
| `CORS_ORIGIN`                                          | `*`                                                  | Origem(ns) do front, separadas por vírgula                                                                     |
| `AUTO_MIGRATE`                                         | `true`                                               | Aplica migrations ao subir                                                                                     |
| `AUTO_SEED`                                            | `false` (`.env.example`: `true`)                     | Cria os dados de demonstração se o banco estiver vazio                                                         |
| `SNIPING_WINDOW_SECONDS` / `SNIPING_EXTENSION_SECONDS` | `120` / `120`                                        | Regra de prorrogação (últimos 2 min → +2 min)                                                                  |
| `FIPE_BASE_URL`                                        | `https://fipe.parallelum.com.br/api/v2`              | Base da API pública de veículos                                                                                |
| `FIPE_TOKEN`                                           | _(vazio)_                                            | Opcional; aumenta o limite de requisições (header `X-Subscription-Token`)                                      |
| `CATALOG_TTL_HOURS`                                    | `24`                                                 | Validade do cache do catálogo                                                                                  |

Em `NODE_ENV=production` a API **recusa subir** com os segredos de desenvolvimento.

### Front (`web/.env`)

| Variável         | Descrição                                                     |
| ---------------- | ------------------------------------------------------------- |
| `VITE_API_URL`   | URL pública da API (embutida no bundle **em tempo de build**) |
| `VITE_SHOW_DEMO` | `false` esconde os botões de contas de demonstração no login  |

---

## Testes

```bash
createdb -U postgres leilao_test        # uma vez
cd api && npm test
```

São **36 testes** de integração contra PostgreSQL real, cobrindo: regras de lance, saldo comprometido (inclusive duas apostas simultâneas do mesmo usuário), concorrência (10 lances idênticos ao mesmo tempo → só 1 aceito; rajadas mantendo a cadeia consistente), anti-sniping, liquidação, cancelamento com estorno, **detecção de cada tipo de adulteração** no histórico, privacidade (nenhum dado pessoal na auditoria/comprovante) e o fluxo completo pela API HTTP.

> ⚠️ Os testes **apagam todas as tabelas** da base apontada. Por padrão usam `leilao_test`; para outra base defina `TEST_DATABASE_URL`. Nunca aponte para uma base com dados.

Também há `npm run typecheck` em `api/` e `web/`.

---

## Deploy

O repositório inclui `render.yaml` (Blueprint do **Render**) que cria **PostgreSQL + API + front estático**:

1. Suba o repositório no GitHub e, no Render, escolha **New → Blueprint** apontando para ele.
2. Após o primeiro deploy, defina duas variáveis:
   - no serviço **autolance-api**: `CORS_ORIGIN` = URL pública do front (ex.: `https://autolance-web.onrender.com`);
   - no site **autolance-web**: `VITE_API_URL` = URL pública da API (ex.: `https://autolance-api.onrender.com`).
3. Faça **redeploy do front** (a URL da API entra no bundle no build).
4. Abra o front e entre com uma conta de demonstração (o seed roda no primeiro boot por causa de `AUTO_SEED=true`).

Alternativas já preparadas: `web/vercel.json` e `web/public/_redirects` (fallback de SPA na Vercel/Netlify) e os `Dockerfile` de cada projeto para qualquer host de containers.

> No plano gratuito do Render a API "dorme" após inatividade: a primeira requisição pode levar cerca de um minuto. Isso não afeta o funcionamento, só a primeira resposta.

---

## Como cada requisito foi resolvido

### Papéis e autenticação

Dois papéis (`auctioneer`, `bidder`) escolhidos no cadastro. JWT de 7 dias; o papel vai no token e **é checado no servidor** em cada rota. Leiloeiro não dá lance (`AUCTIONEER_CANNOT_BID`); licitante não cria lotes.

### Gestão da API externa

- O catálogo (marcas → modelos → anos → ficha do veículo) passa por um **proxy da própria API** com **cache em banco** (`catalog_cache`, TTL configurável).
- Ordem de tentativa: cache válido → API pública → cache vencido (`stale-cache`) → **catálogo de amostra embutido** no código.
- Ao criar o lote, **o snapshot do veículo é gravado no próprio lote** (`lots.attributes`). Por isso **vitrine, salas, auditoria e comprovante nunca chamam a API externa**: se ela cair, só o formulário de "novo lote" é afetado, e mesmo ele oferece o catálogo de amostra.
- O servidor nunca confia nos atributos enviados pelo navegador: busca o veículo pelos códigos (marca/modelo/ano).

### Regras de lance (`api/src/services/bids.ts`)

Tudo dentro de **uma transação** que trava o lote (`SELECT … FOR UPDATE`) e depois o usuário, sempre nessa ordem (evita _deadlock_). O relógio usado é o **do banco**, nunca o do cliente.

- Só aceita lance entre início e fim; o primeiro ≥ lance inicial, os seguintes ≥ lance atual + incremento mínimo; o líder não cobre a si mesmo.
- **Saldo comprometido:** `disponível = total − soma dos lances que o usuário está liderando em lotes abertos`. Ao ser superado, o valor volta ao disponível imediatamente (não há movimentação a desfazer: o comprometido é calculado, não armazenado). O lance só é aceito se couber no disponível.
- **Anti-sniping:** lance aceito com ≤ 2 minutos para o fim leva o término para _agora + 2 min_.
- **Mensagens claras** para cada recusa: abaixo do mínimo (com o valor mínimo), saldo insuficiente (com disponível × lance), você já está ganhando, lote não iniciado, lote encerrado/cancelado.

### Liquidação

Um _worker_ na própria API verifica a cada 1 s os lotes vencidos e, **numa transação**, debita o vencedor, credita o leiloeiro, registra o extrato e emite o comprovante. É idempotente. Lote sem lances fecha **sem vencedor**.

### Tempo real (sem recarregar)

A API expõe **Server-Sent Events** (`/stream`). O evento só avisa "o lote X mudou"; o front então busca o estado pela API normal (nenhum dado privado trafega pelo stream). Como contingência, as telas também fazem _polling_ (5 s na sala). A contagem regressiva usa o **relógio do servidor** (diferença calculada no momento da resposta).

### Telas

Vitrine (ao vivo/agendados/encerrados, busca e filtros), painel do leiloeiro (buscar na API, criar, cancelar, resultados e total recebido), sala ao vivo ("você está ganhando" / "você foi superado"), carteira (total, comprometido, disponível, depósito simulado), meus arremates (com comprovante e link), auditoria pública e comprovante público. **Opcionais entregues:** busca e filtros, cancelamento com estorno automático, Docker Compose, testes automatizados e dark mode.

### Privacidade

Auditoria, histórico de lances e comprovante identificam pessoas só por **apelidos** derivados por HMAC. O apelido do licitante (`L-8A25BA`) é **diferente em cada lote**, então não dá para correlacionar o mesmo licitante entre lotes; o do leiloeiro (`V-175839`) é fixo, pois ele é o vendedor de todos os seus lotes. Nome, e-mail e IDs internos nunca saem nessas rotas (há teste automatizado para isso).

---

## Histórico à prova de adulteração (a técnica)

**Requisito:** qualquer alteração, remoção ou inserção posterior no histórico, **mesmo direto no banco**, deve ser detectada.

Combinação de quatro camadas:

1. **Cadeia de hashes com HMAC-SHA256.** Cada lance guarda `hash = HMAC(segredo, hash_anterior | lote | seq | licitante | valor | horário)`. O primeiro encadeia num "gênesis" derivado do id do lote. Alterar um lance muda o hash dele e quebra todos os seguintes; remover um do meio quebra o encadeamento e a sequência `1..n`.
2. **Segredo fora do banco** (`CHAIN_SECRET`, variável de ambiente). Um hash simples (SHA-256) poderia ser **recalculado por quem edita o banco**; com HMAC, quem só tem acesso ao banco não consegue refazer os hashes depois de adulterar.
3. **Selo do estado do lote** (`lots.head_seal`): HMAC de `bid_count`, último hash, lance atual, líder, lance inicial e incremento. Isso pega o caso difícil: **apagar os últimos lances e "ajustar" o resumo do lote** para parecer consistente (a cadeia remanescente continuaria válida, mas o selo não confere).
4. **Gatilho `append-only`** no PostgreSQL: `UPDATE`, `DELETE` e `TRUNCATE` em `bids` falham. É só a primeira barreira (quem tem privilégio de dono pode desligá-lo); a detecção acima não depende dele.

A **auditoria** (`GET /lots/:id/audit`, pública) recalcula tudo do zero e roda 5 verificações: sequência contínua; cadeia de hashes; _replay_ das regras de lance (mínimo, incremento, líder não cobre a si mesmo, horários coerentes); estado do lote × histórico × selo; e, em lotes liquidados, vencedor, comprovante (também selado por HMAC) e extrato financeiro. A tela mostra "Histórico íntegro" ou "ADULTERADO" com a causa.

**Para ver funcionando**, adultere direto no banco e abra `/auditoria/<id-do-lote>`:

```sql
alter table bids disable trigger bids_append_only;
update bids set amount_cents = 100 where lot_id = '<id-do-lote>' and seq = 1;
-- a página de auditoria passa a mostrar HISTÓRICO ADULTERADO
```

---

## Comportamentos que podem surpreender

- **Saldo inicial é R$ 0** para quem se cadastra; é preciso depositar na carteira. Os clientes de demonstração já vêm com saldo. Depósito simulado limitado a R$ 1.000.000 por operação.
- **Cancelamento com lances é permitido** (além do pedido, que era "sem lances"): exige confirmação e **libera automaticamente** o valor comprometido do líder, registrando um "Estorno" de valor zero no extrato (nada foi debitado antes). Lote encerrado não pode ser cancelado.
- **Lote cancelado some da vitrine**, mas continua acessível pelo link direto, exibindo "Este lote foi cancelado" (não aceita lances; a auditoria dele continua pública).
- **Prorrogação pode se repetir**: cada lance dentro dos últimos 2 minutos estende de novo.
- **Encerramento e liquidação têm até ~1 s de atraso** (o worker roda a cada segundo). Nesse intervalo a tela mostra "Finalizando liquidação…". Se a API estiver fora do ar no horário de término, o lote é liquidado assim que ela voltar; lances já não são aceitos após o horário, pois a regra usa o relógio do banco.
- **O comprovante é público por link**: só o vencedor e o leiloeiro veem o código na interface, mas quem tiver o link consegue abri-lo (é o objetivo do compartilhamento). Mesmo assim ele só traz apelidos.
- **Sugestão automática de imagem** (botão "Sugerir") usa a API pública da Wikipédia, em _best effort_: pode não achar uma foto. Sem imagem, o lote mostra um placeholder.
- **Tempo real em memória:** o barramento de eventos vive no processo da API. Com **mais de uma instância** da API, os eventos só chegam a quem está conectado na mesma instância; o _polling_ de 5 s cobre os demais.
- Não há recuperação de senha (conforme o enunciado).

## Limitações conhecidas

- **API FIPE ao vivo não foi exercitada no ambiente de desenvolvimento** (rede restrita): a integração foi escrita conforme a documentação pública e o **fallback foi o caminho efetivamente testado** de ponta a ponta. Ao rodar em ambiente com internet, confira o formulário de novo lote; se o endereço da API tiver mudado, basta ajustar `FIPE_BASE_URL`.
- **Docker Compose e `render.yaml` não foram executados** no ambiente de desenvolvimento (sem daemon Docker nem conta no Render). O build de produção da API (tsup) e do front (Vite) foi executado e a API empacotada foi iniciada contra um banco vazio com sucesso.
- **O deploy público é obrigatório no desafio e precisa ser feito por você** (passos em [Deploy](#deploy)); informe a URL no formulário de envio.
- A técnica de auditoria **não protege contra quem tem o `CHAIN_SECRET`** (poderia forjar selos) nem contra a **exclusão completa de um lote** com todos os seus lances (ele simplesmente deixa de existir). Saldos da carteira não entram na cadeia: a auditoria só confere a venda × último lance. Em produção real, o complemento natural seria ancorar periodicamente a cabeça das cadeias em um serviço externo imutável.

---

## Uso de IA

Usei IA (Claude, da Anthropic) como ferramenta de apoio na **arquitetura** e na **escrita do código-base**, o que aumentou minha produtividade sem abrir mão da qualidade.

A condução do projeto foi minha. Defini os requisitos, a stack, a identidade visual e o passo a passo de como o sistema deveria ser desenvolvido, e passei esses dados para a IA como contexto.

O que fiz depois, por conta própria:

- **Testei manualmente cada funcionalidade**, seguindo um roteiro que cobre cadastro e login, vitrine, carteira, regras de lance, prorrogação, encerramento e liquidação, comprovante, auditoria e painel do leiloeiro.
- **Revisei o código** para garantir consistência, entendimento do que foi implementado e a qualidade da entrega.

---

## Estrutura do projeto

```
.
├── docker-compose.yml
├── render.yaml
├── api/
│   ├── src/
│   │   ├── server.ts            # bootstrap: migrations, seed, worker de liquidação
│   │   ├── app.ts               # Fastify, JWT, CORS, tratamento de erros
│   │   ├── cli.ts               # migrate | seed | reset
│   │   ├── routes/              # auth, lots, me (carteira/arremates/painel), catalog, stream (SSE)
│   │   ├── services/            # bids, chain, audit, settlement, wallet, lots, receipts, catalog
│   │   ├── lib/                 # crypto (HMAC), clock (relógio do banco), bus, errors
│   │   └── db/                  # knex, migrations (em código, empacotáveis pelo tsup), seed
│   └── test/                    # vitest: bidding, audit, http
└── web/
    └── src/
        ├── pages/               # Home, LotRoom, Wallet, MyBids, Panel, Audit, ReceiptPage, Auth
        ├── components/          # Layout, LotCard, Countdown, CreateLotForm, ui
        └── lib/                 # api, auth, theme, hooks (relógio do servidor, SSE), format
```
