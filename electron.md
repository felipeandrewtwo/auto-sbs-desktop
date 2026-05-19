# Prompt de Implementacao - Modulo Desktop Electron do Auto SBS

## Objetivo

Construir uma aplicacao desktop com Electron para migrar gradualmente o modulo `submitter` do projeto `auto-sbs-linkedin`, com a primeira entrega limitada a:

1. Login integrado com a API existente.
2. Dashboard com listagem de analises realizadas.
3. Visual e experiencia muito proximos do frontend web atual.

Nesta fase nao implementar ainda a automacao completa do submitter. A aplicacao deve ficar preparada para receber, em uma etapa posterior, a migracao do fluxo Playwright atualmente em `src/modules/submitter/app.ts`.

## Contexto dos Projetos

- Projeto atual do submitter: `D:\2026\repositórios\2027\auto-sbs-linkedin`
- Frontend de referencia visual e comportamental: `D:\2026\repositórios\2027\auto-sbs-frontend`
- API de integracao: `D:\2026\repositórios\2027\auto-sbs-api`

O modulo atual de submitter usa Playwright, le `output/analise-vagas.json`, filtra vagas por criterios de ambiente e processa candidaturas no LinkedIn. A aplicacao Electron deve ser pensada para, futuramente, orquestrar esse fluxo com interface desktop, logs, controles de execucao e persistencia segura.

## Prompt Principal Para o Agente Implementador

Voce e um engenheiro senior TypeScript/React/Electron. Implemente uma aplicacao desktop Electron para o Auto SBS, reaproveitando o maximo possivel dos padroes visuais e de integracao ja existentes no frontend web.

Antes de editar codigo, leia os projetos:

- `D:\2026\repositórios\2027\auto-sbs-frontend`
- `D:\2026\repositórios\2027\auto-sbs-api`
- `D:\2026\repositórios\2027\auto-sbs-linkedin\src\modules\submitter`

Crie uma base Electron moderna, segura e preparada para evolucao. Use React + TypeScript no renderer, Electron no main process e uma camada preload para IPC quando necessario. Mantenha `contextIsolation: true`, `nodeIntegration: false` e exponha apenas APIs minimas pelo preload.

Para a primeira versao, implemente somente:

- Tela de login.
- Persistencia segura do token de acesso.
- Dashboard autenticado com listagem de analises realizadas.
- Opcao de sair.
- Estados de loading, erro, vazio e sessao expirada.
- Abertura de links externos no navegador padrao, nao dentro da janela Electron.

Nao implementar ainda submissao automatica no LinkedIn, analise com Gemini, upload de CV, cadastro, configuracoes, delecao em massa ou reanalise, a menos que seja estritamente necessario para manter a navegacao coerente.

## Stack Recomendada

Preferir:

- Electron
- React 18+
- TypeScript
- Vite
- Tailwind CSS
- lucide-react
- electron-builder ou electron-forge para empacotamento futuro

Se o projeto `auto-sbs-linkedin` for receber a aplicacao desktop, organizar em uma estrutura clara, por exemplo:

```text
src/desktop/
  main/
    main.ts
    window.ts
    security.ts
  preload/
    index.ts
  renderer/
    main.tsx
    App.tsx
    pages/
      Login.tsx
      Dashboard.tsx
    components/
      DashboardHeader.tsx
      AnalysisCard.tsx
      Loading.tsx
      EmptyState.tsx
    services/
      api.ts
      auth.ts
    types/
      index.ts
```

Tambem e aceitavel criar um app Electron separado dentro do workspace se isso combinar melhor com os scripts atuais, desde que a documentacao deixe claro como executar.

## Referencia Visual Obrigatoria

A interface deve se parecer com o frontend atual em `auto-sbs-frontend`.

Tela de login de referencia:

- Arquivo: `src/pages/Login.tsx`
- Layout centralizado.
- Fundo claro `bg-gray-50` e suporte a dark mode `dark:bg-slate-900`.
- Card branco/escuro com borda suave, sombra, inputs com icones `Mail` e `Lock`.
- Marca com icone `Briefcase`.
- Botao primario azul usando a paleta `primary`.
- Botao de alternancia de tema no canto superior direito.

Dashboard de referencia:

- Arquivos principais:
  - `src/pages/Dashboard.tsx`
  - `src/components/DashboardHeader.tsx`
  - `src/components/VagaAnalisadaCard.tsx`
  - `src/components/Tabs.tsx`
  - `src/index.css`
  - `tailwind.config.js`

Usar a mesma identidade visual:

- Marca: `Auto SBS`
- Subtitulo: `Inteligencia Artificial para Vagas`
- Header fixo/sticky com icone `Briefcase`, tema e logout.
- Cards com classe equivalente a:

```css
.card {
  background: white;
  border-radius: 0.75rem;
  border: 1px solid;
  padding: 1.5rem;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}
```

- Paleta principal do frontend:

```js
primary: {
  50: '#f0f9ff',
  100: '#e0f2fe',
  200: '#bae6fd',
  300: '#7dd3fc',
  400: '#38bdf8',
  500: '#0ea5e9',
  600: '#0284c7',
  700: '#0369a1',
  800: '#075985',
  900: '#0c4a6e',
}
```

Evitar uma tela com cara generica de Electron. A janela deve abrir diretamente na experiencia do produto, com login se nao autenticado ou dashboard se ja houver sessao valida.

## Contratos da API

A API Nest nao usa prefixo global. Por padrao roda em:

```text
http://localhost:3001
```

Permitir configurar a URL base por variavel de ambiente, por exemplo:

```text
VITE_API_URL=http://localhost:3001
```

### Login

Endpoint:

```http
POST /auth/login
Content-Type: application/json
```

Body:

```json
{
  "email": "usuario@email.com",
  "senha": "senha"
}
```

Resposta esperada:

```json
{
  "message": "Login realizado com sucesso",
  "token": "jwt"
}
```

Observacoes:

- A API tambem define cookie `refreshToken` httpOnly.
- No desktop, nao depender somente de `localStorage` para dados sensiveis.
- Preferir salvar o JWT usando armazenamento seguro, como `keytar`, `safeStorage` do Electron ou outra estrategia documentada.
- Se usar `localStorage` temporariamente para MVP, deixar TODO claro para migrar para armazenamento seguro antes de distribuir.

### Listar Analises

Endpoint:

```http
GET /analises
Authorization: Bearer <token>
Accept: application/json
```

Resposta:

```json
{
  "analises": [],
  "total": 0
}
```

### Listar Analises Submetidas

Endpoint opcional para abas/filtro:

```http
GET /analises/submetidas
Authorization: Bearer <token>
Accept: application/json
```

Resposta:

```json
{
  "analises": [],
  "total": 0
}
```

### Atualizar Status de Submissao

Pode ficar preparado, mas nao e obrigatorio na primeira entrega:

```http
PATCH /analises/:id/submetida
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "submetida": true,
  "analise": {}
}
```

## Tipo de Dados

Usar estes tipos como base no renderer:

```ts
export interface Vaga {
  cargo: string;
  empresa: string;
  linkEmpresa?: string;
  localidade: string;
  modoTrabalho?: string;
  tipoContrato?: string;
  id: string;
  linkVaga: string;
  profileRecrutador?: string;
  descricao?: string;
  categoria?: string;
  subcategorias?: string[];
  candidaturaSimplificada?: boolean;
}

export interface VagaAnalisada extends Vaga {
  porcentagemAlinhamento: number;
  recomendacao: string;
  pontosFortes: string[];
  pontosFracos: string[];
  submetido?: boolean;
  ingles?: boolean;
}
```

Atencao: a API atual pode nao retornar `categoria`, `subcategorias` e `candidaturaSimplificada` em `GET /analises`, entao a UI deve tratar esses campos como opcionais sem quebrar.

## Comportamento da Tela de Login

Requisitos:

- Campos `email` e `senha`.
- Validacao HTML basica.
- Loading no botao durante requisicao.
- Exibir erro retornado pela API.
- Ao autenticar, persistir token e navegar para dashboard.
- Se ja houver token salvo, tentar abrir dashboard diretamente.
- Se a API retornar erro relacionado a email nao verificado, mostrar mensagem clara. Nao precisa implementar tela de verificacao nesta fase.

## Comportamento do Dashboard

Requisitos:

- Ao carregar, buscar `GET /analises`.
- Ordenar as analises por `porcentagemAlinhamento` decrescente, como no frontend.
- Mostrar contador total.
- Mostrar cards responsivos em grid:
  - 1 coluna no mobile/estreito.
  - 2 colunas em largura media.
  - 3 colunas em largura ampla.
- Exibir:
  - Cargo
  - Empresa
  - Localidade
  - Modo de trabalho
  - Tipo de contrato
  - Percentual de alinhamento
  - Recomendacao
  - Pontos fortes
  - Pontos de atencao
  - Badge de ingles quando disponivel
  - Badge de submetida quando `submetido === true`
  - Link externo para a vaga no LinkedIn
- Se nao houver analises, mostrar estado vazio: `Nenhuma analise realizada`.
- Em erro 401, limpar sessao e voltar para login.

Opcional nesta fase:

- Aba `Todas` e `Submetidas`.
- Filtros simples por empresa, ingles e faixa de alinhamento.
- Alternancia de tema persistida.

## Boas Praticas Electron

Implementar com seguranca desde o inicio:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`, se compativel com a arquitetura escolhida.
- Desabilitar navegacao arbitraria dentro da janela principal.
- Bloquear `window.open` para destinos nao confiaveis.
- Abrir URLs externas com `shell.openExternal`.
- Validar no main process os canais IPC expostos pelo preload.
- Nunca expor `ipcRenderer` inteiro no `window`.
- Nao colocar secrets no renderer.
- Nao gravar token em arquivos texto sem protecao.
- Definir CSP adequada para producao.

Exemplo conceitual de preload:

```ts
contextBridge.exposeInMainWorld('desktop', {
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  auth: {
    getToken: () => ipcRenderer.invoke('auth:get-token'),
    setToken: (token: string) => ipcRenderer.invoke('auth:set-token', token),
    clearToken: () => ipcRenderer.invoke('auth:clear-token'),
  },
});
```

## Preparacao Para Migracao do Submitter

Mesmo sem implementar agora, deixar a arquitetura pronta para:

- Rodar o submitter a partir do main process, nao do renderer.
- Enviar progresso para o renderer via IPC:
  - total de vagas
  - vaga atual
  - status
  - logs
  - erros
  - conclusao/cancelamento
- Permitir cancelar execucao com seguranca.
- Reaproveitar a autenticacao da API para buscar analises em vez de depender apenas de `output/analise-vagas.json`.
- Manter o estado Playwright/LinkedIn isolado em uma pasta controlada.

O fluxo atual em `src/modules/submitter/app.ts`:

- Le `output/analise-vagas.json`.
- Filtra por:
  - `submetido !== true`
  - `porcentagemAlinhamento >= PORCENTAGEM_SUBMISSAO`
  - ingles conforme `INGLES`
  - tipo de contrato conforme `TIPO_CONTRATO`
- Abre `linkVaga`.
- Chama `processarSubmissao(page, vaga)`.
- Usa `state.json` como storage state do Playwright.

Na futura migracao, transformar esses criterios em configuracoes editaveis na UI desktop.

## Scripts Esperados

Adicionar scripts claros ao `package.json`, por exemplo:

```json
{
  "scripts": {
    "desktop:dev": "vite --config ...",
    "desktop:electron": "electron ...",
    "desktop:build": "tsc && vite build ...",
    "desktop:package": "electron-builder"
  }
}
```

A nomenclatura pode variar conforme a estrutura escolhida, mas deve existir um comando simples para rodar a aplicacao em desenvolvimento.

## Criterios de Aceite

A entrega e considerada pronta quando:

- A aplicacao Electron abre sem erros.
- A tela de login autentica contra a API real.
- O token e reutilizado apos fechar e abrir o app.
- O dashboard lista analises vindas de `GET /analises`.
- Loading, erro, vazio e 401 estao tratados.
- O visual esta claramente alinhado ao frontend atual.
- Links externos abrem no navegador padrao.
- A configuracao de API base esta documentada.
- O codigo nao quebra o modulo submitter atual.
- O caminho para a proxima fase da migracao do submitter esta claro no README ou comentarios de arquitetura.

## Fora de Escopo Nesta Fase

- Criar conta.
- Recuperar senha.
- Verificacao de email.
- Upload de CV.
- Analise com Gemini.
- Submissao automatica no LinkedIn.
- Empacotamento final assinado.
- Auto-update.
- Sincronizacao offline.

## Nota de Qualidade

Priorize uma primeira versao pequena, bem integrada e segura. A meta nao e replicar todo o frontend web, mas criar uma base desktop confiavel com a mesma identidade visual, pronta para receber a automacao do submitter sem misturar responsabilidades entre renderer, main process e API.
