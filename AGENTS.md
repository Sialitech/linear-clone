# AGENTS.md

Guía para agentes que trabajan en este repo. Describe `origin/main` en el commit `1a1c5ca` (PR #34, imágenes en issues). El `README.md` cubre la puesta en marcha y el despliegue para personas; aquí está lo que hace falta para cambiar código sin romper nada.

## Qué es

Gestor de issues con interfaz estilo Linear: inbox, triage, proyectos con lista y tablero Kanban, ciclos, vistas guardadas, comentarios en vivo con menciones, Markdown con imágenes, integración con GitHub, servidor MCP remoto y webhooks salientes.

- **Frontend:** Next.js 15 (App Router, Turbopack), React 19, TypeScript estricto, Tailwind CSS 4, shadcn estilo `base-nova` sobre `@base-ui/react`, lucide-react, dnd-kit, Tiptap 3, react-markdown, sonner.
- **Backend:** Convex (base de datos, queries, mutations, actions, HTTP, storage, scheduler) con Convex Auth. Zod 4 valida los argumentos mediante `convex-helpers`.
- **Despliegue:** Vercel + Convex. Producción en `https://linear.sialitech.com`.
- **Node:** 22.x (`engines`).

No hay API REST propia ni ORM: el cliente llama a funciones de Convex con `useQuery` / `useMutation` y los datos se actualizan solos.

## Comandos

```bash
npm install
npx convex dev          # backend en desarrollo; escribe NEXT_PUBLIC_CONVEX_URL en .env.local
npm run dev             # Next en http://localhost:3000
npm run lint            # ESLint (next/core-web-vitals + next/typescript)
npm run build           # next build --turbopack
node --test tests/*.test.ts   # tests unitarios
```

- **No existe `npm test`.** Los tests usan `node:test` + `node:assert/strict` y el borrado de tipos nativo de Node (22.18+ o 24). `tsconfig.json` excluye `tests/`.
- `convex/_generated/` lo regenera `npx convex dev`. No lo edites a mano.
- No hay CI en el repo (`.github/` no existe). La comprobación real es el build de preview de Vercel.

## Flujo de trabajo obligatorio

Está en [.cursor/rules/feature-deploy.mdc](.cursor/rules/feature-deploy.mdc) y aplica a cualquier agente:

1. Cada feature va en una rama nueva creada desde `main` actualizado. Un commit por cambio lógico y `git push -u origin HEAD`.
2. Nunca se despliega a producción a mano. Lo que se comprueba es el preview de la rama.
3. El build de Vercel ejecuta `npx convex deploy --cmd 'npm run build' && npm run convex:postdeploy`. Un deployment `READY` para el SHA empujado implica que Convex también se desplegó en el preview de esa rama; un `ERROR` deja Convex sin el cambio.
4. Tras cada push hay que comprobar el deployment de ese SHA (proyecto Vercel `prj_wQcJRdUHfgN3MfT7opmG0y8GagLi`, team `team_qcOWFSYH6sF7im5mNNXsNUrk`) y el preview de Convex antes de dar la tarea por hecha.

`convex:postdeploy` fija `SITE_URL` en los previews y `AUTH_PASSWORD_DISABLED=true` en producción, así que en producción solo hay login con Google.

## Mapa del repo

```text
convex/
  schema.ts            Tablas e índices (fuente de verdad del modelo)
  model.ts             Enumerados, etiquetas y lógica pura compartida con el cliente
  auth.ts, auth.config.ts   Convex Auth: Password (desactivable) + Google
  http.ts              Rutas HTTP: auth, /github/*, /mcp
  issues.ts            Issues: listados, crear, actualizar, triage, mover, borrar, sub-issues
  comments.ts          Comentarios y menciones
  projects.ts, labels.ts, cycles.ts, views.ts, activities.ts, users.ts
  attachments.ts       Subida de imágenes
  apiTokens.ts         Tokens personales para MCP
  mcp.ts, mcpProtocol.ts    Servidor MCP (despacho de herramientas / JSON-RPC puro)
  webhooks.ts          Webhooks salientes: CRUD y entrega
  github.ts, githubNode.ts  Integración GitHub (runtime por defecto / "use node")
  lib/
    functions.ts       zQuery, zMutation, zAction y esquemas Zod de ids y enumerados
    access.ts          requireUser, requireWorkspaceMember, assertCanManage, publicUser…
    activity.ts        recordActivity y etiquetas legibles
    keys.ts            slug de workspace, clave de proyecto, toSearchText
    attachments.ts, materializeImages.ts   Vinculación y decodificado de imágenes
    webhooks.ts, webhookEvents.ts, webhookPayload.ts, webhookSign.ts, webhookUrl.ts
    github.ts, githubJwt.ts
src/
  app/                 Rutas (páginas finas de servidor) + globals.css
  app/mcp/route.ts     Proxy POST/OPTIONS hacia Convex
  middleware.ts        Protección de rutas con Convex Auth
  components/          Pantallas y componentes cliente
  components/ui/       Primitivas shadcn sobre base-ui
  lib/                 Utilidades puras (formato, markdown, agrupación, imágenes…)
tests/                 Tests de módulos puros de convex/ y src/lib/
```

Alias de TypeScript: `@/*` → `src/*` y `@convex/*` → `convex/*`. El cliente importa `api` de `@convex/_generated/api` y los enumerados de `@convex/model`.

## Modelo de datos

Todo cuelga de un **workspace**. Cualquier dato lleva `workspaceId` (o se llega a él por el issue o el proyecto) y el acceso se decide por la tabla `members`.

| Tabla | Qué guarda | Notas |
|---|---|---|
| `workspaces`, `members`, `invites` | Workspace, pertenencia con rol (`owner`, `admin`, `member`) e invitaciones por email | Las invitaciones se reclaman en `ensureWorkspace` |
| `projects` | Nombre, `key` de 3 letras, estado, `issueCounter` | La `key` es única por workspace |
| `issues` | Título, descripción Markdown, estado, prioridad, asignado, etiquetas, fecha, ciclo, padre, `order`, `number` | Identificador visible `KEY-number` (p. ej. `GEN-12`) |
| `comments`, `mentions` | Comentarios y una fila por usuario mencionado | `mentionIds` puede faltar en filas antiguas: trátalo como `[]` |
| `activities` | Historial del issue (18 tipos) con `fromLabel` / `toLabel` | Solo texto ya formateado |
| `labels`, `cycles`, `views` | Etiquetas, ciclos numerados y vistas guardadas (filtros + agrupación + orden) | |
| `attachments` | Imágenes en `_storage`, enlazadas a issue o comentario | |
| `apiTokens` | Tokens MCP: solo el hash SHA-256 y un prefijo | |
| `webhooks`, `webhookDeliveries` | Suscripciones y cola/historial de entregas | |
| `github*`, `projectRepos`, `pullRequests` | App de GitHub, instalaciones, tokens OAuth, repos y PRs enlazados | Contienen secretos |

**Estados de issue** (`convex/model.ts`): `triage`, `backlog`, `todo`, `in_progress`, `in_review`, `done`, `canceled`. Los cinco centrales son `WORKFLOW_STATUSES` y son las columnas del tablero. `triage` y `canceled` quedan fuera de los listados salvo que se filtre por estado o se busque texto.

**Prioridades:** `urgent`, `high`, `medium`, `low`, `none`.

Si añades un valor a un enumerado hay que tocar tres sitios: el `v.union` de `schema.ts`, la constante y sus etiquetas en `model.ts`, y los iconos o selectores del cliente. Los esquemas Zod de `lib/functions.ts` se derivan de `model.ts`.

## Backend: reglas que hay que respetar

### Definir funciones

- Usa siempre `zQuery`, `zMutation` o `zAction` de `convex/lib/functions.ts`, con argumentos Zod. Para ids, los esquemas `workspaceIdSchema`, `issueIdSchema`, etc. (`zid`).
- La lógica reutilizable va en una función exportada (`createIssue`, `updateIssue`, `listIssues`, `triageIssue`, `createComment`…) y el `zMutation` solo la envuelve. El servidor MCP llama a esas mismas funciones.
- Lecturas con `ctx.db.get("tabla", id)`, índices con `.withIndex(...)` y siempre `.take(n)`. No hay paginación: los listados tienen topes fijos (100–500 filas). No uses `.collect()` ni `.filter()` de Convex; se filtra en memoria tras el `take`.
- Los errores para el usuario son `throw new Error("mensaje en inglés")` (o `ConvexError`). El cliente los limpia con `errorMessage()` y los muestra en un toast.

### Autorización

Toda función pública empieza por una de estas llamadas de `convex/lib/access.ts`:

- `requireUser(ctx)`: hay sesión.
- `requireWorkspaceMember(ctx, workspaceId)`: devuelve `{ userId, membership }`.
- `requireIssueAccess(ctx, issueId)` / `requireProjectAccess(ctx, projectId)`: cargan el documento y comprueban la pertenencia.
- `assertCanManage(membership)`: solo `owner` o `admin` (renombrar workspace, miembros, borrar proyecto, webhooks, repos de GitHub).

**No llames a `getAuthUserId` directamente.** El servidor MCP actúa como el dueño del token mediante `setMcpActor()`, una variable de módulo que `requireUser` consulta. Una función que se salte `requireUser` fallará al invocarse desde MCP.

Además, cualquier id recibido del cliente (asignado, etiquetas, ciclo, padre, proyecto destino) se valida contra el workspace del issue: mira `assertAssignee`, `assertLabels`, `assertParent` y `assertAssignableCycle`.

Nunca devuelvas un documento `users` entero: usa `publicUser` / `loadPublicUser`.

### Efectos que acompañan a cada cambio de issue o comentario

Una mutación que modifique issues o comentarios debe mantener, en la misma transacción:

1. **`updatedAt`** del issue, y **`searchText`** con `toSearchText(title, description)` si cambian título o descripción.
2. **Actividad:** `recordActivity` con el tipo adecuado y etiquetas legibles.
3. **Webhooks:** `emitWebhookEvents`. Para actualizaciones de issue usa `publishIssueUpdate(ctx, antes, después)`, que calcula los eventos comparando ambos estados.
4. **Imágenes:** `linkAttachments` con el texto nuevo, para enlazar las imágenes referenciadas y borrar las que ya no aparecen.

Lo más seguro es pasar por `updateIssue` / `createIssue` / `createComment` en lugar de hacer `ctx.db.patch` directo.

### Issues: detalles

- **Numeración:** `createIssue` incrementa `projects.issueCounter`. No reutilices números.
- **Orden en el tablero:** `order` es un número; al soltar una tarjeta se usa el punto medio entre vecinas. `issues.move` solo cambia estado y orden.
- **Sub-issues:** `parentId`, con un máximo de 6 niveles y detección de ciclos (`assertParent`). `setParent` registra actividad y eventos en hijo y padre.
- **Triage:** `issues.triage` con acción `send`, `accept` (a `todo` por defecto), `decline` (a `canceled`) o `snooze` (requiere fecha futura en `snoozedUntil`). `splitTriage` separa la cola en pendientes y pospuestos.
- **Búsqueda:** índice de búsqueda `search_text` sobre `searchText`, filtrable por workspace y proyecto.
- **Ciclos:** solo uno activo por workspace. No se puede asignar un issue a un ciclo completado, salvo que ya estuviera en él. `moveUnfinishedToNext` cierra el activo y arrastra lo no terminado al siguiente.

### Alta de usuario

`users.ensureWorkspace` se llama desde el cliente cuando el usuario no tiene workspaces. Reclama invitaciones pendientes y, si no hay ninguna, crea el workspace con el proyecto «General», seis issues de ejemplo, tres etiquetas y las vistas «All issues» y «My issues».

## Frontend

### Rutas

| Ruta | Pantalla |
|---|---|
| `/login`, `/signup` | `AuthScreen` (contraseña oculta cuando `VERCEL_ENV` es `production`) |
| `/` | `InboxScreen`: asignados a mí y menciones |
| `/triage` | `TriageScreen` |
| `/projects`, `/projects/[id]`, `/projects/[id]/board` | `ProjectsScreen`, `ProjectScreen` en modo lista o tablero |
| `/cycles` | `CyclesScreen` |
| `/views/[viewId]` | `SavedViewScreen` (`/views` redirige a `/`) |
| `/issues/[issueId]` | `IssueDetail` a página completa |
| `/settings` | Apariencia, perfil, workspace, miembros, MCP, webhooks, GitHub |
| `POST /mcp` | Proxy hacia Convex |

Cada `page.tsx` es un componente de servidor mínimo que renderiza una pantalla cliente. `src/middleware.ts` redirige a `/login` si no hay sesión y deja pasar `/mcp` sin autenticar.

### Estructura de la aplicación

`layout.tsx` monta, en este orden: Convex Auth (servidor), `ThemeProvider`, `ConvexClientProvider`, `TooltipProvider` y el `Toaster`. El grupo `(app)` añade `AppShell`, que es `WorkspaceProvider` + barra lateral + dos elementos únicos para toda la app: `IssueComposer` e `IssuePeek`.

`useWorkspace()` expone:

- `workspace`, `workspaces`, `setWorkspaceId` y `me`. El workspace activo se guarda en `localStorage["linear-clone:workspace"]`.
- `openCreate(defaults)`, `openEdit(issueId)`, `closeComposer()`: abren el diálogo de crear o editar.
- `openIssue(issueId)`, `closeIssue()`: abren el issue en un modal (peek).

El peek y el compositor son **estado en memoria, no URL**: no sobreviven a una recarga ni responden al botón atrás. Un clic normal en un issue abre el peek; con Cmd/Ctrl, Alt o botón central se navega a `/issues/[id]`.

### Patrones

- **Datos:** `useQuery(api.x.y, workspace ? { workspaceId: workspace._id } : "skip")`. `undefined` significa cargando (se pinta un skeleton) y `null`, no encontrado. Las consultas que no hacen falta todavía se pasan como `"skip"`.
- **Mutaciones:** `try { await m(args) } catch (e) { toast.error(errorMessage(e)) }`. La validación en cliente usa Zod `safeParse`.
- **Actualización optimista:** solo el tablero usa `withOptimisticUpdate`, y parchea la caché de `api.issues.list` con argumentos exactamente `{ workspaceId, projectId }`. Si cambias los argumentos de esa consulta en modo tablero, el arrastre deja de reflejarse al instante. En el resto se usa estado local con vuelta atrás si falla.
- **Persistencia de opciones:** las vistas guardadas almacenan filtros, agrupación y orden en el servidor (`api.views.update`). Los filtros de la pantalla de proyecto son estado local. `localStorage` solo guarda el tema y el workspace.
- **Tipos:** en `src/lib/types.ts`, derivados con `FunctionReturnType` de las consultas. No dupliques interfaces a mano.
- **`"use client"`** en todo componente interactivo. `src/lib` son módulos puros sin React.

### Componentes clave

- `issue-list.tsx`: lista con grupos, selección múltiple (Shift y Cmd/Ctrl), barra de acciones en lote, arrastrar una fila sobre otra para hacerla sub-issue, y selectores de estado y prioridad en línea.
- `issue-detail.tsx`: compartido por la página y el peek. Título y descripción se editan en el sitio; la descripción se guarda sola con un retardo de 450 ms y una cola que mantiene una sola petición en vuelo.
- `issue-composer.tsx`: crear y editar. La recurrencia y los enlaces extra **no son campos**: se escriben como texto dentro de la descripción.
- `issue-context-menu.tsx`: menú contextual propio (no base-ui) con submenús y atajos; en táctil se abre con pulsación larga.
- `kanban-board.tsx`: dnd-kit; columnas = `WORKFLOW_STATUSES`.
- `view-controls.tsx`: filtros y opciones de visualización de las vistas guardadas, con envío en serie para que la respuesta del servidor no pise ediciones en curso.
- `markdown-editor.tsx` / `markdown-body.tsx`: editor Tiptap que guarda Markdown, y visor de solo lectura con react-markdown. Las URL pasan por `safeMarkdownUrl` y lo guardado por `sanitizeStoredMarkdown`.

### Estilo

- Tailwind 4 configurado en `src/app/globals.css` (no hay `tailwind.config`). Tema claro en `:root` y oscuro en `.dark`. Usa siempre los tokens: `bg-background`, `text-muted-foreground`, `bg-accent`, `border-border`, `bg-popover`, `bg-sidebar`… No pongas colores hexadecimales en los componentes.
- El tema es un proveedor propio (`theme-provider.tsx`) con solo `light` y `dark`; `next-themes` está instalado pero no se usa.
- Primitivas en `src/components/ui/`, basadas en base-ui: se componen con la prop `render` (`<DropdownMenuTrigger render={<Button />}>`), no con `asChild`.
- Densidad habitual: texto de `text-[13px]` y `text-[11px]`, iconos `size-3.5`. En móvil los controles crecen (`h-9 sm:h-7`).
- `cn()` se importa de `@/lib/utils`. Iconos de `lucide-react`; `StatusIcon` es un SVG propio.
- Los textos de la interfaz están en inglés.

## Integraciones

### Servidor MCP

Recorrido: `POST /mcp` en el host de la app → `src/app/mcp/route.ts` (proxy, necesita `NEXT_PUBLIC_CONVEX_SITE_URL`) → `handleMcp` en `convex/http.ts` → `convex/mcpProtocol.ts` (JSON-RPC sin estado: `initialize`, `ping`, `tools/list`, `tools/call`) → `internal.mcp.dispatch` en `convex/mcp.ts`.

- **Tokens:** `lin_` + 32 bytes aleatorios. Solo se guarda el hash SHA-256. El texto se muestra una vez. Máximo 10 por usuario y workspace.
- **Identidad:** el token actúa como el usuario que lo creó, dentro de su workspace.
- **Referencias:** las herramientas aceptan ids de Convex o identificadores como `ENG-12`.
- **Imágenes:** `save_issue` y `save_comment` aceptan hasta 4 imágenes en base64 de 1 MB como máximo.

**Añadir una herramienta:**

1. Añade su esquema a `MCP_TOOLS` en `convex/mcpProtocol.ts`.
2. Añade el `case` en el `switch` de `dispatch` (`convex/mcp.ts`), devolviendo `toolResult(asJson(...))`. Reutiliza las funciones exportadas de `issues.ts` y `comments.ts` para conservar permisos, actividad y webhooks.
3. Actualiza la lista del `README.md` y los tests (`tests/mcp-protocol.test.ts`, `tests/triage.test.ts`).

`dispatch` es una mutación: una herramienta no puede hacer `fetch`.

### Webhooks salientes

- Los gestiona `owner` o `admin` en Ajustes. Máximo 10 por workspace.
- **23 eventos** definidos en `convex/lib/webhookEvents.ts` (`issue.created`, `issue.status_changed`, `comment.created`…). Una sola mutación puede emitir varios.
- **Cuerpo:** `{ action, type, createdAt, data, updatedFrom?, related? }`. Se guarda como texto y se firma exactamente ese texto.
- **Cabeceras:** `X-Webhook-Signature: sha256=<HMAC-SHA256 del cuerpo>` (la clave es el secreto completo, con el prefijo `whsec_`), `X-Webhook-Id` y `X-Webhook-Event`.
- **Entrega:** `enqueueDelivery` inserta la fila y programa `internal.webhooks.deliver` en la misma transacción. Reintentos a los 30 s, 2 min, 10 min y 1 h (5 intentos). Tras 10 entregas fallidas seguidas el webhook se desactiva. Se conservan 50 entregas por webhook.
- **URL:** solo `https`, sin credenciales, y se bloquean hosts locales y rangos privados (`convex/lib/webhookUrl.ts`). Se comprueba al crear y otra vez al enviar.

Si añades un campo al issue que deba notificarse, actualiza `IssueChangeSnapshot`, `issueWebhookData`, `WEBHOOK_EVENT_IDS` y sus etiquetas.

### Imágenes

1. El cliente valida (`image/*`, 5 MB), pide `attachments.generateUploadUrl`, sube el fichero y llama a `attachments.register`.
2. El editor inserta `![nombre](url)` con la URL pública del storage de Convex.
3. Al guardar el issue o el comentario, `linkAttachments` enlaza la fila y borra del storage las imágenes que ya no se referencian.

La expresión regular que reconoce esas URL está repetida en `convex/lib/attachments.ts`, `convex/lib/keys.ts` y `src/lib/images.ts`: cámbialas juntas.

### GitHub

- **App de producto única**, tomada de las variables `GITHUB_APP_SLUG`, `GITHUB_APP_ID` y `GITHUB_APP_PRIVATE_KEY` si están las tres, o de la tabla `githubPlatformApp`.
- **Instalación:** `api.github.beginOAuth` genera un estado de un solo uso (30 min) y devuelve la URL de instalación; GitHub vuelve a `GET /github/setup` y se guarda la instalación del workspace. El navegador regresa a `/settings?github=connected`.
- **PRs:** se enlazan pegando la URL (`linkPullRequest`). El estado solo se actualiza a mano con `refreshPullRequest`: primero con el token de instalación y, si no, con el token OAuth del usuario. No hay cron ni webhooks entrantes (`POST /github/webhook` responde 200 sin hacer nada).
- **Repos por proyecto:** `setProjectRepo` guarda `owner/name`; hoy es solo informativo.
- **Nombre de rama:** `src/lib/github-branch.ts` genera `cursor/<identificador>-<slug>`.
- **`githubNode.ts`** lleva `"use node"` porque firmar el JWT de la app necesita `node:crypto`. Un fichero `"use node"` solo puede exportar actions: no importes `lib/githubJwt.ts` desde un fichero del runtime por defecto.

**Secretos:** tokens, client secrets y claves privadas están en tablas de Convex y solo los leen funciones `internal*`. Las consultas públicas devuelven proyecciones (`oauthStatus`, `publicPullRequest`). No añadas ninguno de esos campos a una función pública.

## Variables de entorno

| Dónde | Variable | Uso |
|---|---|---|
| Vercel / `.env.local` | `NEXT_PUBLIC_CONVEX_URL` | Cliente Convex (obligatoria) |
| Vercel / `.env.local` | `NEXT_PUBLIC_CONVEX_SITE_URL` | Destino del proxy `/mcp` |
| Vercel | `CONVEX_DEPLOY_KEY` | `npx convex deploy` en el build |
| Vercel | `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | Analítica, opcional; se envía por `/ingest` |
| Convex | `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS` | Convex Auth |
| Convex | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Login con Google |
| Convex | `AUTH_PASSWORD_DISABLED` | `true` quita el login con contraseña |
| Convex | `GITHUB_APP_*`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub |

Los secretos van en el deployment de Convex, nunca en variables `NEXT_PUBLIC_`. Los `.env*` están en `.gitignore`.

## Tests

Los tests cubren solo módulos puros: `convex/lib/*` (webhooks, GitHub, imágenes), `convex/mcpProtocol.ts`, `convex/model.ts` y `src/lib/*` (markdown, árbol y grupos de issues, imágenes). No hay tests de funciones Convex ni de componentes.

Para que un módulo sea testeable con `node --test`:

- Importaciones relativas con extensión `.ts`. Nada de alias `@/` ni `@convex/`.
- Sin `enum` ni otra sintaxis que no se pueda borrar.
- Sin importar `_generated` ni código de servidor de Convex.

Por eso la lógica se separa en ficheros puros (`webhookEvents.ts`, `webhookPayload.ts`, `materializeImages.ts`, `mcpProtocol.ts`) y los ficheros con `ctx` quedan finos. Sigue ese reparto al añadir lógica nueva y acompáñala de su test.

**Fallo conocido:** `tests/issue-groups.test.ts` no arranca porque `src/lib/issue-groups.ts` importa `@convex/model`, que Node no resuelve. El resto pasa.

## Puntos frágiles conocidos

Comportamientos actuales que conviene tener presentes. No son instrucciones de cambio.

**Efectos que faltan en algunas rutas**

- `issues.move` no registra actividad aunque cambie el estado (sí emite webhook).
- `issues.remove` no borra las filas de `activities` ni las imágenes del issue.
- `projects.remove` borra issues y comentarios sin borrar menciones, actividades ni imágenes, y sin emitir webhooks.
- `cycles.moveUnfinishedToNext` cambia el ciclo de los issues sin actividad ni webhooks.
- Los cambios de ciclo y de proyecto no tienen tipo de actividad; sí tienen evento de webhook.

**Seguridad (visto leyendo el código, sin probar en ejecución)**

- En MCP, `memberOrThrow` comprueba que existen el usuario y el workspace, no que siga habiendo pertenencia. Las herramientas que leen la base directamente (`list_projects`, `list_users`, `list_labels`, `list_cycles`) seguirían respondiendo a un token de un miembro expulsado.
- `GET /github/register/callback` no está autenticado y gana el primer registro mientras no haya app configurada.
- `GET /github/setup` confía en el `installation_id` de la URL.
- La validación de URL de webhooks es textual: no resuelve DNS.
- Las imágenes se sirven por URL pública del storage, sin comprobación de acceso.

**Interfaz**

- Cmd/Ctrl+K abre el compositor desde `app-shell.tsx` y también es el atajo de enlace del editor Markdown.
- El compositor usa colores oscuros fijos y no sigue el tema claro.
- El menú contextual rotula la fecha como `⇧D` pero responde a `D`.

**Código sin uso**

- Flujo de manifest por workspace (`/github/manifest/callback`, tabla `githubApps`) y los helpers `buildGithubManifest`, `githubAuthorizeUrl`, `githubOAuthStartUrl` (solo los usan los tests).
- Helpers de textarea en `src/lib/markdown-edit.ts` (`wrapSelection`, `togglePrefix`, `insertLink`…), anteriores a Tiptap.
- Dependencia `next-themes` y las primitivas `textarea`, `badge`, `scroll-area` y `separator`.

## Lista de comprobación antes de dar un cambio por hecho

- [ ] Rama propia, no `main`.
- [ ] Función Convex nueva: `zQuery`/`zMutation`, comprobación de acceso al principio, ids validados contra el workspace, `.take(n)`.
- [ ] Cambio en issues o comentarios: `updatedAt`, `searchText`, actividad, webhooks e imágenes.
- [ ] Cambio de esquema compatible con los datos existentes (campos nuevos como `v.optional`).
- [ ] Enumerado nuevo en `schema.ts`, `model.ts` y cliente.
- [ ] Herramienta MCP o evento de webhook nuevo reflejado en el `README.md`.
- [ ] Interfaz: tokens de tema, claro y oscuro, tamaños táctiles en móvil.
- [ ] `npm run lint` y `node --test tests/*.test.ts`.
- [ ] Push y deployment de preview en `READY` para ese SHA.
