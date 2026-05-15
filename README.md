# Auto SBS Desktop

Aplicacao desktop Electron para o Auto SBS.

## Rodar em desenvolvimento

1. Instale as dependencias:
   - `npm install --prefix desktop`
2. Configure a API:
   - copie `.env.example` para `.env` dentro de `desktop/`
3. Rode:
   - `npm run desktop:dev`

## Escopo implementado nesta fase

- Login com `POST /auth/login`
- Persistencia de token no processo main (`safeStorage` quando disponivel)
- Dashboard autenticado com `GET /analises`
- Tratamento de loading, erro, vazio e `401` (sessao expirada)
- Logout e abertura de links externos no navegador padrao
- Tema claro/escuro persistido localmente

## Notas de arquitetura para proxima fase (migracao submitter)

- O renderer nao executa automacao; essa evolucao deve entrar no processo `main`.
- A ponte `preload` ja esta isolada para IPC e deve crescer com canais de:
  - iniciar submitter
  - progresso (total, atual, status, logs)
  - cancelamento seguro
- O fluxo atual de `src/modules/submitter/app.ts` pode ser encapsulado em um servico do `main` sem expor Playwright ao renderer.
