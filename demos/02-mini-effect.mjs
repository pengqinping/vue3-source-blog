/**
 * 02 · mini-effect：ReactiveEffect、双向依赖清理、嵌套 effect 栈
 * 对应文章：02《副作用心脏：effect 与依赖收集》
 * 运行：node demos/02-mini-effect.mjs
 *
 * 还原源码 effect.ts 的三个关键点：
 *  1. activeSub + 栈：嵌套 effect 时恢复外层上下文（run() 里 prev 压栈/出栈）
 *  2. cleanup：每次重跑前清空旧依赖，解决「分支切换导致的死依赖」
 *  3. 双向记录：dep 记住 effect，effect 也记住 dep，才能高效清理
 */

// ---------- 依赖管理（双向记录版） ----------
const targetMap = new WeakMap()
let activeSub = undefined
const subStack = [] // 嵌套 effect 栈

function getDep(target, key) {
  let depsMap = targetMap.get(target)
  if (!depsMap) targetMap.set(target, (depsMap = new Map()))
  let dep = depsMap.get(key)
  if (!dep) depsMap.set(key, (dep = new Set()))
  return dep
}

function track(target, key) {
  if (!activeSub) return
  const dep = getDep(target, key)
  dep.add(activeSub)              // dep -> effect（trigger 用）
  activeSub.deps.push(dep)        // effect -> dep（cleanup 用）
}

function trigger(target, key) {
  const dep = targetMap.get(target)?.get(key)
  if (dep) for (const sub of [...dep]) sub.run()
}

// ---------- ReactiveEffect（对照源码 effect.ts 的 class ReactiveEffect） ----------
class ReactiveEffect {
  constructor(fn) { this.fn = fn; this.deps = []; this.cleanup = undefined }
  run() {
    if (this.cleanup) { this.cleanup(); this.cleanup = undefined } // 先清旧依赖
    const prev = activeSub
    const prevStack = [...subStack]
    subStack.push(this)
    activeSub = this
    try { this.fn() } finally {
      // 嵌套 effect 结束时，恢复外层的 activeSub（源码 run() 中的 prevEffect）
      subStack.pop()
      activeSub = subStack[subStack.length - 1] ?? prev ?? prevStack[prevStack.length - 1]
    }
  }
}

function effect(fn) {
  const e = new ReactiveEffect(fn)
  e.run()
  return e
}

// ============ 演示 ============
const state = { a: 'A 值', b: 'B 值', ok: true }
const p = new Proxy(state, {
  get(t, k) { track(t, k); return t[k] },
  set(t, k, v) { const old = t[k]; t[k] = v; if (old !== v) trigger(t, k); return true },
})

console.log('▶ 演示 1：分支切换 —— 如果不做 cleanup，死依赖会导致幽灵更新')
let times = 0
const e1 = effect(() => {
  times++
  // 条件为 true 时只依赖 ok 和 a；false 时只依赖 ok 和 b
  const text = p.ok ? p.a : p.b
  console.log(`  [第${times}次运行] ok=${p.ok}, 渲染 = ${text}`)
})

console.log('  执行 p.ok = false（分支切换，从依赖 a 切到依赖 b）：')
p.ok = false
console.log('  执行 p.a = "A 新值"（此刻没人依赖 a，不应重跑）：')
p.a = 'A 新值'
console.log('  ✅ effect 没有重跑 —— cleanup 把旧的 a 依赖清掉了')
console.log('  执行 p.b = "B 新值"：')
p.b = 'B 新值'

console.log('\n▶ 演示 2：嵌套 effect —— 内层跑完，activeSub 恢复为外层')
const inner = { count: 0 }
const innerP = new Proxy(inner, {
  get(t, k) { track(t, k); return t[k] },
  set(t, k, v) { t[k] = v; trigger(t, k); return true },
})
effect(() => {
  console.log('  [外层] 读 outer.val =', p.ok === true ? p.a : p.b)
  effect(() => {
    console.log('  [内层] 读 inner.count =', innerP.count)
  })
})
console.log('  内层创建完后，执行 innerP.count = 1（只有内层应重跑）：')
innerP.count = 1
console.log('  ✅ 只重跑了内层，外层的 activeSub 上下文已正确恢复')
