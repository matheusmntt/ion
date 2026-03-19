/**
 * usage-examples.ts
 *
 * Exemplos comentados cobrindo todos os recursos do framework.
 * Este arquivo não é executável diretamente — serve como documentação viva.
 */

import {
  App,
  createStore,
  effect,
  batch,
  applyBindings,
} from "./index"

// ─────────────────────────────────────────────────────────────────────────────
// 1. Store básico + subscribe
// ─────────────────────────────────────────────────────────────────────────────
{
  const store = createStore({ count: 0 })

  // Subscriber simples — recebe o estado atualizado
  const unsub = store.subscribe((state) => {
    console.log("count is", state.count)
  })

  store.state.count++ // → "count is 1"
  store.state.count++ // → "count is 2"

  unsub()
  store.state.count++ // sem log — unsubscribed
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. onChange — listener com detalhes completos
// ─────────────────────────────────────────────────────────────────────────────
{
  const store = createStore({ name: "Ana", age: 30 })

  store.onChange((prop, value, state) => {
    console.log(`prop "${String(prop)}" changed to`, value)
  })

  store.state.name = "João" // → prop "name" changed to João
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. watch com dot-notation — propriedades aninhadas
// ─────────────────────────────────────────────────────────────────────────────
{
  const store = createStore({
    user: { name: "Ana", address: { city: "São Paulo" } },
  })

  // Antes: watch('user', cb) não disparava ao mudar user.name
  // Agora: caminhos profundos funcionam corretamente
  store.watch("user.name", (value) => {
    console.log("user.name →", value)
  })

  store.watch("user.address.city", (value) => {
    console.log("city →", value)
  })

  store.state.user.name = "João"         // → user.name → João
  store.state.user.address.city = "Curitiba" // → city → Curitiba
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Computed com cache
// ─────────────────────────────────────────────────────────────────────────────
{
  const store = createStore(
    { firstName: "Ana", lastName: "Lima" },
    {
      computed: {
        // Forma simples (função direta)
        fullName: (state) => `${state.firstName} ${state.lastName}`,
      },
    }
  )

  console.log(store.state.fullName) // "Ana Lima"
  // → recalcula apenas quando firstName ou lastName mudarem
  // → acessos repetidos retornam o valor cacheado
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. batch — agrupa mutações em uma única notificação
// ─────────────────────────────────────────────────────────────────────────────
{
  const store = createStore({ x: 0, y: 0, z: 0 })

  let notifyCount = 0
  store.subscribe(() => notifyCount++)

  // Sem batch: 3 notificações
  store.state.x = 1
  store.state.y = 2
  store.state.z = 3

  notifyCount = 0

  // Com batch: 1 notificação (flush único ao sair do batch)
  batch(() => {
    store.state.x = 10
    store.state.y = 20
    store.state.z = 30
  })

  // notifyCount === 1 (aproximadamente — depende do scheduler)
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. effect — rastreamento automático de dependências
// ─────────────────────────────────────────────────────────────────────────────
{
  const store = createStore({ count: 0, name: "Ana" })

  // Executa imediatamente. Re-executa quando `count` mudar.
  // NÃO re-executa quando `name` mudar (não foi lido).
  const stop = effect(() => {
    console.log("count:", store.state.count)
    // retorno opcional: cleanup para antes do próximo run
    return () => console.log("cleanup antes do próximo run")
  })

  store.state.count++ // → cleanup... → "count: 1"
  store.state.name = "João" // sem efeito — não é dep
  store.state.count++ // → cleanup... → "count: 2"

  stop() // desativa o effect permanentemente
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Bindings DOM — data-bind, data-show, data-model, data-attr, data-class
// ─────────────────────────────────────────────────────────────────────────────
// HTML esperado:
// <div id="app">
//   <h1 data-bind="title"></h1>
//   <p data-show="isLoggedIn">Bem-vindo!</p>
//   <input data-model="username" type="text">
//   <img data-attr="avatar:src">
//   <div data-class="isActive:highlight">...</div>
// </div>
{
  const store = createStore({
    title: "Meu App",
    isLoggedIn: true,
    username: "",
    avatar: "https://example.com/avatar.png",
    isActive: false,
  })

  const root = document.getElementById("app")!
  const cleanup = applyBindings(root, store)

  // Qualquer elemento com data-bind/data-show/data-model adicionado
  // dinamicamente ao DOM também será conectado automaticamente
  // (via MutationObserver interno)

  // cleanup() para desconectar tudo
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. data-for — renderização de listas
// ─────────────────────────────────────────────────────────────────────────────
// HTML esperado:
// <ul data-for="todos">
//   <li data-for-item>
//     <span data-bind="text"></span>
//     <em data-show="done">✓</em>
//   </li>
// </ul>
{
  const store = createStore({
    todos: [
      { text: "Comprar café", done: true },
      { text: "Estudar reatividade", done: false },
    ],
  })

  // Cada item cria um store escoped com as props do objeto
  // { text, done, $index }
  applyBindings(document.querySelector("ul")!, store)

  // Adicionar item → lista re-renderiza automaticamente
  store.state.todos = [
    ...store.state.todos,
    { text: "Novo item", done: false },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Plugin — binding customizado
// ─────────────────────────────────────────────────────────────────────────────
{
  // Plugin que adiciona data-tooltip
  const TooltipPlugin = {
    install(ctx: any) {
      ctx.registerBinding("data-tooltip", (el: HTMLElement, expr: string) => {
        el.title = expr
        // poderia registrar um listener de store para bindings dinâmicos
      })
    },
  }

  App.use(TooltipPlugin)

  // Agora qualquer <span data-tooltip="Clique aqui"> é tratado automaticamente
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. App completo — composição de tudo
// ─────────────────────────────────────────────────────────────────────────────
{
  const counterStore = App.store("counter", { count: 0 })

  App.component("[data-counter]", (el) => {
    const btn = el.querySelector("button")!

    const onClick = () => counterStore.state.count++
    btn.addEventListener("click", onClick)

    const stopEffect = App.effect(() => {
      el.setAttribute("aria-label", `count: ${counterStore.state.count}`)
    })

    return {
      cleanup: () => {
        btn.removeEventListener("click", onClick)
        stopEffect()
      },
    }
  })

  App.start()
}
