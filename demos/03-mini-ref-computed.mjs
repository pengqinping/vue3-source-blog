/**
 * 03 · mini-ref-computed：ref 为什么必须是 ref，computed 为什么能缓存
 * 对应文章：03《ref 与 computed：响应式的一等公民》
 * 运行：node demos/03-mini-ref-computed.mjs
 *
 * 还原源码 ref.ts / computed.ts（v3.5）的核心：
 *  - RefImpl: 用 .value 作为「读/写」的拦截点（Proxy 拦不住原始值）
 *  - ComputedRefImpl: 惰性求值 + dirty 脏检查，变化时只「标记脏」不立刻算
 */

// ---------- 依赖管理（与 01 相同的简化版） ----------
const targetMap = new WeakMap()
let activeSub = undefined

function getDep(target, key) {
  let m = targetMap.get(target); if (!m) targetMap.set(target, (m = new Map()))
  let d = m.get(key); if (!d) m.set(key, (d = new Set()))
  return d
}
function track(target, key) {
  if (activeSub) getDep(target, key).add(activeSub)
}
function trigger(target, key) {
  const dep = targetMap.get(target)?.get(key)
  if (dep) for (const sub of [...dep]) sub.run()
}
function reactive(obj) {
  return new Proxy(obj, {
    get(t, k) { track(t, k); return t[k] },
    set(t, k, v) { t[k] = v; trigger(t, k); return true },
  })
}

// ---------- ref（对照源码 ref.ts 的 class RefImpl） ----------
let uid = 0
class RefImpl {
  constructor(value) { this._value = value; this.dep = new Set(); this.__isRef = true }
  get value() {                       // 读 .value = 拦截点，等价于 Proxy 的 get
    if (activeSub) this.dep.add(activeSub)   // track
    return this._value
  }
  set value(newVal) {                 // 写 .value = 拦截点，等价于 Proxy 的 set
    if (newVal !== this._value) {
      this._value = newVal
      // 关键：dep 里既可能是 effect 也可能是 computed，
      // 所以源码统一走每个订阅者的 notify()（ComputedRefImpl 通知 = 标脏，ReactiveEffect 通知 = 重跑）
      for (const sub of [...this.dep]) sub.notify()
    }
  }
}
function ref(value) { return new RefImpl(value) }

// ---------- computed（对照源码 computed.ts 的 ComputedRefImpl） ----------
class ComputedRefImpl {
  constructor(getter) {
    this.getter = getter
    this._value = undefined
    this.dirty = true        // 标记：需要重新计算
    this.dep = new Set()     // 谁在依赖我这个 computed
  }
  // 让自己变成一个「可被订阅者」：getter 里 track 的副作用们会通知到我
  notify() { this.dirty = true; for (const sub of [...this.dep]) sub.run() }
  get value() {
    if (this.dirty) {
      console.log('    [computed] 重新计算中…')
      // 求值时把自己挂到 activeSub 位置，让 getter 内部 track 到 this
      const prev = activeSub
      activeSub = this
      try { this._value = this.getter() } finally { activeSub = prev }
      this.dirty = false
    }
    // computed 自身也要被 track：外层 effect 才能在它变化时收到通知
    if (activeSub) this.dep.add(activeSub)
    return this._value
  }
}
function computed(getter) { return new ComputedRefImpl(getter) }

function effect(fn) {
  // 每个订阅者都有统一的 notify() 入口 —— 这正是源码 Subscriber 接口的设计
  const sub = {
    run() { activeSub = sub; fn(); activeSub = undefined },
    notify() { this.run() },
  }
  sub.run()
  return sub
}

// ============ 演示 ============
console.log('▶ 演示 1：ref —— 原始值只有 .value 能当「属性」读写，才拦得住')
const count = ref(0)
effect(() => console.log(`  effect#0 看到 count.value = ${count.value}`))
console.log('  执行 count.value = 1：')
count.value = 1
console.log('  执行 count.value = 1（值没变，不应触发）：')
count.value = 1
console.log('  ✅ 值未变化，无重跑')

console.log('\n▶ 演示 2：computed —— 惰性 + 缓存（没读到就不算，读多次只算一次）')
const num = ref(1)
const double = computed(() => num.value * 2)
console.log('  创建 computed 但还没读 —— 注意：上面没有「重新计算中」')
console.log('  第一次读 double.value：')
console.log('  double.value =', double.value)
console.log('  第二次读 double.value（缓存生效）：')
console.log('  double.value =', double.value)

console.log('\n▶ 演示 3：computed 的「标记脏」—— 改依赖，只标记不立刻算')
console.log('  执行 num.value = 10（double 标记为脏，但还没重算）：')
num.value = 10
console.log('  再读 double.value 才真正重算：')
console.log('  double.value =', double.value)

console.log('\n▶ 演示 4：effect 依赖 computed —— num 一变，effect 收到新值')
effect(() => console.log(`  effect#1 看到 double.value = ${double.value}`))
console.log('  执行 num.value = 20：')
num.value = 20
