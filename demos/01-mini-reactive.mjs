/**
 * 01 · mini-reactive：60 行手写 Proxy 响应式
 * 对应文章：01《响应式地基：reactive 与 Proxy 拦截》
 * 运行：node demos/01-mini-reactive.mjs
 *
 * 简化说明：真实源码（v3.5.46）用 Dep/Link/Subscriber 双向链表管理依赖，
 * 这里用 targetMap: WeakMap<target, Map<key, Set<effect>>> 建立直觉，
 * 核心的 Proxy 拦截点与源码完全一致：get -> track，set -> trigger。
 */

// 1. 依赖仓库：target -> key -> 依赖这个 key 的 effect 集合
const targetMap = new WeakMap()

// 2. 当前正在运行的 effect（源码里叫 activeSub）
let activeSub = undefined

// 3. track：在「读」的时候，把当前 effect 记到这个 key 名下
function track(target, key) {
  if (!activeSub) return
  let depsMap = targetMap.get(target)
  if (!depsMap) targetMap.set(target, (depsMap = new Map()))
  let dep = depsMap.get(key)
  if (!dep) depsMap.set(key, (dep = new Set()))
  dep.add(activeSub)
  console.log(`    [track]   ${key} <- effect#${activeSub.id}`)
}

// 4. trigger：在「写」的时候，把这个 key 名下的 effect 全部重新执行
function trigger(target, key) {
  const dep = targetMap.get(target)?.get(key)
  if (!dep) return
  for (const sub of [...dep]) sub.run()
}

// 5. reactive：返回一个 Proxy，读走 track，写走 trigger
function reactive(obj) {
  return new Proxy(obj, {
    get(target, key) {
      track(target, key)
      const val = Reflect.get(target, key)
      // 嵌套对象「用到才代理」：源码 reactive.ts 中 `return isObject(val) ? reactive(val) : val`
      return typeof val === 'object' && val !== null ? reactive(val) : val
    },
    set(target, key, value) {
      const old = target[key]
      const ok = Reflect.set(target, key, value)
      if (ok && old !== value) {
        console.log(`    [trigger] ${key}: ${old} -> ${value}`)
        trigger(target, key)
      }
      return ok
    },
  })
}

// 6. effect：包装一个会随数据变化自动重跑的函数
let uid = 0
function effect(fn) {
  const sub = { id: uid++, run() { activeSub = sub; fn(); activeSub = undefined } }
  sub.run()
  return sub
}

// ============ 演示 ============
console.log('▶ 演示 1：数据变化，依赖它的 effect 自动重跑')
const state = reactive({ count: 0, msg: 'hello' })
effect(() => {
  console.log(`  effect#0 看到 count = ${state.count}`)
})
console.log('  执行 state.count = 1：')
state.count = 1
console.log('  执行 state.count = 2：')
state.count = 2

console.log('\n▶ 演示 2：嵌套对象「用到才代理」')
const state2 = reactive({ profile: { age: 18 } })
effect(() => {
  console.log(`  effect#1 看到 profile.age = ${state2.profile.age}`)
})
console.log('  执行 state2.profile.age = 20（内层也是响应式的）：')
state2.profile.age = 20

console.log('\n▶ 演示 3：没被 effect 读过的属性，改了也不会触发任何人')
console.log('  执行 state.msg = "hi"（没有 effect 依赖 msg）：')
state.msg = 'hi'
console.log('  —— 上面没有任何 effect 重跑，因为 track 时没记录它')
