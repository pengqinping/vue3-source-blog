/**
 * 04 · mini-watch：watch 为什么「同一 tick 改三次只回调一次」
 * 对应文章：04《watch / watchEffect 与调度器 scheduler》
 * 运行：node demos/04-mini-watch.mjs
 *
 * 还原源码两个关键点：
 *  1. reactivity 的 effect 带 scheduler 选项：数据变化时不立刻跑，而是把「任务」丢进队列
 *  2. runtime-core 的 flushJobs：用微任务（Promise.resolve().then）统一刷队列 → nextTick 的本质
 */

// ---------- 1. 响应式底座（同前几篇的简化版） ----------
const targetMap = new WeakMap()
let activeSub = undefined
function getDep(t, k) {
  let m = targetMap.get(t); if (!m) targetMap.set(t, (m = new Map()))
  let d = m.get(k); if (!d) m.set(k, (d = new Set()))
  return d
}
function track(t, k) { if (activeSub) getDep(t, k).add(activeSub) }
function trigger(t, k) {
  const dep = targetMap.get(t)?.get(k)
  if (dep) for (const sub of [...dep]) sub.notify()
}
function reactive(o) {
  return new Proxy(o, {
    get(t, k) {
      track(t, k)
      const v = t[k]
      // 嵌套对象也要代理，deep traverse 才能一路 track 下去
      return v && typeof v === 'object' ? reactive(v) : v
    },
    set(t, k, v) { const old = t[k]; t[k] = v; if (old !== v) trigger(t, k); return true },
  })
}

// ---------- 2. 调度器（对照 runtime-core/src/scheduler.ts） ----------
const queue = new Set()          // 去重的任务队列（Set 保证同一个 job 只入队一次）
let isFlushing = false
const resolvedPromise = Promise.resolve()

function nextTick(fn) {          // 源码同名函数，就是排队到 flush 后面
  return fn ? resolvedPromise.then(fn) : resolvedPromise
}

function queueJob(job) {
  queue.add(job)                 // 关键：Set 自动去重 → 同 tick 改 100 次也只有 1 个 job
  if (!isFlushing) {
    isFlushing = true
    resolvedPromise.then(flushJobs)   // 微任务时机统一刷新
  }
}

function flushJobs() {
  isFlushing = false
  const jobs = [...queue].sort((a, b) => a.id - b.id)  // 源码按 uid 排序保证父先于子
  queue.clear()
  for (const job of jobs) job()
}

// ---------- 3. ReactiveEffect 带 scheduler（对照 reactivity/src/effect.ts） ----------
function effect(fn, { scheduler, lazy } = {}) {
  const e = {
    run() {
      activeSub = e
      try { fn() } finally { activeSub = undefined }
    },
    // trigger 时不再直接 run()，而是交给 scheduler 决定「何时跑」
    notify() { scheduler ? scheduler(e) : e.run() },
  }
  if (!lazy) e.run()
  return e
}

// ---------- 4. watch（对照 runtime-core/src/apiWatch.ts 的 doWatch） ----------
function watch(source, cb, { immediate = false, deep = false } = {}) {
  let getter, oldValue, cleanup
  if (typeof source === 'function') getter = source
  else if (source.__isRef) getter = () => source.value
  else { // 对象默认走 deep：源码里的 traverse() 就是一次全量递归遍历，只为读一遍收集依赖
    getter = () => source
    if (deep) { const seen = new Set(); getter = () => { const walk = o => {
      if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o)
      for (const k in o) walk(o[k])
    }; walk(source); return source } }
  }
  const applyCb = () => { cleanup?.(); const old = oldValue; cb(old, source.__isRef ? source.value : source) ; oldValue = undefined }
  const e = effect(() => getter(), {
    lazy: true,          // watch 是懒的：第一次只收集依赖，不执行回调
    scheduler: e => queueJob(applyCb),  // 变化时：任务入队，而不是立刻回调
  })
  if (immediate) applyCb()
  else { e.run(); oldValue = getter() }  // 先跑一遍记录旧值
  return () => (cleanup = () => {})      // 简化的停止函数
}

// ============ 演示 ============
const state = reactive({ count: 0 })

console.log('▶ 演示 1：同步世界里的异步回调 —— 同一 tick 改 3 次，只回调 1 次')
watch(() => state.count, (old) => {
  console.log(`  [watch 回调] count 变了（此刻最新值 = ${state.count}）`)
})
console.log('  执行 state.count = 1 / 2 / 3：')
state.count = 1
state.count = 2
state.count = 3
console.log('  同步代码结束 —— watch 还没跑！（它被排进了微任务队列）')
nextTick(() => {
  console.log('  [nextTick] 队列刷新完毕，上面只出现了一次 watch 回调 ✅')
})

console.log('\n▶ 演示 2：immediate —— 创建时立刻回调一次')
watch(() => state.count, (old) => {
  console.log(`  [immediate watch] 触发, old = ${old}`)
}, { immediate: true })

console.log('\n▶ 演示 3：deep —— 改深层属性也能被侦听到')
const obj = reactive({ a: { b: { c: 1 } } })
watch(obj, () => {
  console.log('  [deep watch] obj.a.b.c 变化被侦听到（traverse 全量遍历收集依赖）')
}, { deep: true })
obj.a.b.c = 99
