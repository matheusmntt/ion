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

  store.state.count++
  store.state.count++
  // → um único "count is 2" no próximo microtask: mudanças no mesmo tick
  //   são deduplicadas, cada subscriber roda uma vez por flush

  unsub()
  store.state.count++ // sem log — unsubscribed
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. onChange — listener com detalhes completos
// ─────────────────────────────────────────────────────────────────────────────
{
  const store = createStore({ name: "Ana", age: 30 })

  // Diferente do subscribe, onChange recebe cada mudança individualmente,
  // com a chave alterada e o caminho completo a partir da raiz do store
  store.onChange((prop, value, state, path) => {
    console.log(`prop "${String(prop)}" (${path.join(".")}) changed to`, value)
  })

  store.state.name = "João" // → prop "name" (name) changed to João
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. watch com dot-notation — propriedades aninhadas
// ─────────────────────────────────────────────────────────────────────────────
{
  const store = createStore({
    user: { name: "Ana", address: { city: "São Paulo" } },
  })

  // O watch rastreia cada chave do caminho: dispara quando a folha muda
  // ou quando um objeto intermediário é substituído
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
  //   (as dependências são registradas a cada cálculo)
  // → acessos repetidos retornam o valor cacheado
  // → effects e bindings que leem fullName re-executam quando ele invalida
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. batch — muda QUANDO as notificações rodam, não quantas
// ─────────────────────────────────────────────────────────────────────────────
{
  const store = createStore({ x: 0, y: 0, z: 0 })

  let notifyCount = 0
  store.subscribe(() => notifyCount++)

  // Sem batch: 1 notificação, no próximo microtask (deduplicada)
  store.state.x = 1
  store.state.y = 2
  store.state.z = 3
  // aqui notifyCount ainda é 0

  // Com batch: 1 notificação, síncrona, quando o batch externo retorna
  batch(() => {
    store.state.x = 10
    store.state.y = 20
    store.state.z = 30
  })

  // notifyCount === 1 logo após o batch (o flush do microtask acima ainda
  // não rodou se estivermos no mesmo tick)
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

  store.state.count++
  store.state.name = "João" // não é dep — não agenda o effect
  // → no próximo microtask: cleanup... → "count: 1"

  stop() // desativa o effect (inclusive um re-run já agendado)
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

  // Cada item cria um store escopado com uma cópia rasa das props do objeto
  // { text, done, $index }
  applyBindings(document.querySelector("ul")!, store)

  // Adicionar item, ou mudar uma prop de um item → a lista inteira
  // re-renderiza (listas não usam keys)
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
      // O handler recebe o elemento, o valor do atributo, os stores do App
      // e o store sendo ligado — com ele dá para criar bindings reativos
      ctx.registerBinding("data-tooltip", (el: HTMLElement, expr: string) => {
        el.title = expr
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
