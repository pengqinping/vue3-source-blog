/**
 * 08 · mini-lifecycle：父子组件生命周期顺序（高频面试题现场还原）
 * 对应文章：09《组件系统：setup 与生命周期在源码中的位置》
 * 运行：node demos/08-mini-lifecycle.mjs
 *
 * 面试必考：父子组件的生命周期到底谁先谁后？
 *  - mounted：  子先父后（父的 render 过程递归挂载子树，子的 mounted 先入队）
 *  - updated：  父先子后（父的更新 job 先跑，patch 中才触发子的更新 job）
 *  - unmounted：子先父后（卸载同理，从叶子往上）
 */

const postFlushQueue = []  // 模拟源码 pendingPostFlushCbs：mounted/updated 都在这里排队

function createComponent(name, uid, def) {
  return { name, uid, ...def }
}

// ---------- 挂载：对照 renderer.ts 的 mountComponent ----------
function mountComponent(comp) {
  console.log(`  [mount] <${comp.name}> setup() 执行 —— 组合式 API 入口`)
  comp.ctx = comp.setup ? comp.setup() : {}
  console.log(`  [mount] <${comp.name}> render() 生成 vnode`)
  // render/patch 过程中递归挂载子树：子组件先走完整个挂载流程
  for (const child of comp.children || []) mountComponent(child)
  // 自身（含全部子树）挂载完成后，mounted 钩子才入队 → 子的钩子排在前面
  postFlushQueue.push(() => comp.hooks.mounted?.())
}

// ---------- 更新：父的 job 先跑，patch 过程才触发子的 job ----------
const pendingJobs = [] // 模拟源码 queue 里的组件更新 job（按 uid 升序执行）
function updateComponent(comp) {
  console.log(`  [update] <${comp.name}> 更新 job 执行（uid=${comp.uid}，uid 小的先跑）`)
  comp.render(comp.ctx)
  // patch 子树 → 子组件也要更新 → 子的 job 入队（本轮 flush 内随后执行）
  for (const child of comp.children || []) pendingJobs.push(() => updateComponent(child))
  postFlushQueue.push(() => comp.hooks.updated?.())
}

// ---------- 组建一个父子结构 ----------
const log = []
const Child = createComponent('Child', 1, {
  setup() { return { msg: '我是子组件' } },
  render() { console.log(`  [render] <Child> 渲染：${this.ctx.msg}`) },
  hooks: {
    mounted() { log.push('Child.mounted') },
    updated() { log.push('Child.updated') },
  },
})
const Parent = createComponent('Parent', 0, {
  setup() { return { count: 0 } },
  render() { console.log(`  [render] <Parent> 渲染，count=${this.ctx.count}`) },
  children: [Child],
  hooks: {
    mounted() { log.push('Parent.mounted') },
    updated() { log.push('Parent.updated') },
  },
})

// ============ 演示 1：挂载顺序 ============
console.log('▶ 演示 1：首次挂载 —— mounted 谁先执行？')
mountComponent(Parent)
for (const cb of [...postFlushQueue]) cb() // 模拟 flushPostFlushCbs
postFlushQueue.length = 0
console.log('  实际顺序：', log.join(' → '))
console.log('  ✅ 子先父后：父的 mounted 必须等整棵子树挂完\n')

// ============ 演示 2：更新顺序 ============
log.length = 0
console.log('▶ 演示 2：父组件状态变化 —— updated 谁先执行？')
console.log('  执行 Parent.count = 1：')
Parent.ctx.count = 1
updateComponent(Parent)                       // 父的 job（uid=0）先执行
for (const job of [...pendingJobs]) job()     // patch 触发的子的 job 随后执行
pendingJobs.length = 0
for (const cb of [...postFlushQueue]) cb()
postFlushQueue.length = 0
console.log('  实际顺序：', log.join(' → '))
console.log('  ✅ 父先子后：更新从父开始，patch 自上而下传播\n')

// ============ 演示 3：钩子注册的本质 ============
console.log('▶ 演示 3：onMounted 到底做了什么？')
console.log('  onMounted(fn) = 在当前实例的 scope 上注册一个 post 阶段的回调')
console.log('  源码 apiLifecycle.ts：injectHook("mounted", fn, instance) → instance.m = [fn]')
console.log('  所以组合式 API 可以注册任意多个同名钩子，它们按注册顺序依次执行')
