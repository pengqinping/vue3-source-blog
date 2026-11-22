/**
 * 06 · mini-renderer：patchFlag 快速通道 —— Vue 3 快在哪
 * 对应文章：07《渲染器：createVNode 与 patch 全流程》
 * 运行：node demos/06-mini-renderer.mjs
 *
 * 还原 runtime-core/src/renderer.ts 的核心分支：
 *   n1 === null          → mount
 *   patchFlag 命中       → 走「精确更新」快速通道，跳过全量 props diff
 *   其余                 → 走传统 diff
 */

const PatchFlags = { TEXT: 1, CLASS: 2, STYLE: 4, PROPS: 8, FULL_PROPS: 16 }

function h(type, props, children, patchFlag = 0, dynamicProps = null) {
  return { type, props, children, patchFlag, dynamicProps, el: null }
}

// ---------- mount：挂载（对照 renderer.ts 的 processElement + mountElement） ----------
function mount(vnode, container) {
  // 为了在 node 里可运行，用「假 DOM」对象模拟 DOM 节点
  const el = (vnode.el = { tag: vnode.type, props: {}, children: [] })
  if (vnode.props) for (const [k, v] of Object.entries(vnode.props)) setProp(el, k, v)
  if (typeof vnode.children === 'string') {
    el.children = vnode.children
  } else if (Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      if (typeof child === 'string') el.children.push({ text: child })
      else mount(child, el)
    }
  }
  container.children.push(el)
  return el
}

function setProp(el, key, value) {
  el.props[key] = value
  console.log(`      [setProp] ${key}="${value}"`)
}

// ---------- patch：更新（对照 renderer.ts 的 patchElement） ----------
function patch(n1, n2) {
  // 分支 1：类型不同 → 卸载旧的，挂载新的（源码 patch 里 `n1.type !== n2.type` → unmount+mount）
  if (n1.type !== n2.type) {
    console.log(`    [patch] 类型不同 <${n1.type}> → <${n2.type}>，整个替换`)
    return mount(n2, { children: [] })
  }
  const el = (n2.el = n1.el)

  // ★ 分支 2：patchFlag 快速通道 —— 编译期已知道「只有文字会变」
  if (n2.patchFlag & PatchFlags.TEXT) {
    console.log(`    [patch] 命中 TEXT(1) 快速通道：只更新文字，跳过 props diff！`)
    el.children = [typeof n2.children === 'string' ? { text: n2.children } : n2.children]
    return el
  }
  // ★ 分支 3：已知具体哪些 prop 会变（dynamicProps 数组是编译期算好的）
  if (n2.patchFlag & PatchFlags.PROPS && n2.dynamicProps) {
    console.log(`    [patch] 命中 PROPS(8) 快速通道：只 diff 编译器标记的 ${n2.dynamicProps.length} 个属性`)
    for (const key of n2.dynamicProps) setProp(el, key, n2.props[key])
    return el
  }
  // 分支 4：FULL_PROPS 或运行时手写的 vnode → 全量 props diff
  console.log(`    [patch] 无标记 → 全量 props diff（遍历新旧所有属性）`)
  let count = 0
  for (const k in n2.props) {
    if (n1.props[k] !== n2.props[k]) { setProp(el, k, n2.props[k]); count++ }
  }
  for (const k in n1.props) if (!(k in n2.props)) count++ // 移除消失的属性
  console.log(`      [全量 diff] 共比对 ${Object.keys(n1.props).length + Object.keys(n2.props).length} 次属性`)
  return el
}

// ---------- 模拟 DOM 容器（node 里没有 document） ----------
const container = { children: [] }

// ============ 演示 ============
console.log('▶ 场景 A：编译器产出的 vnode —— <p> 节点已带 TEXT(1) 标记')
// 编译期已知：这个 <p> 里只有「文字」是动态的 → flag=1
const v1 = h('div', { id: 'app' }, [h('p', null, ['你好，小明'], 1 /* TEXT */)])
const v2 = h('div', { id: 'app' }, [h('p', null, ['你好，小红'], 1 /* TEXT */)])
mount(v1, container)
console.log('  执行 patch(v1.children[0], v2.children[0])：')
patch(v1.children[0], v2.children[0])
console.log('  ✅ 只换了文字，props 一次都没有比对\n')

console.log('▶ 场景 B：编译器产出 —— 已知只有 2 个属性可能变化（PROPS=8 + dynamicProps）')
const c1 = h('input', { type: 'text', placeholder: '输入...', disabled: false }, null, 8, ['placeholder', 'disabled'])
const c2 = h('input', { type: 'text', placeholder: '请输入姓名', disabled: true }, null, 8, ['placeholder', 'disabled'])
mount(c1, container)
console.log('  执行 patch(c1, c2)：')
patch(c1, c2)
console.log('  ✅ type 属性（静态）根本没被比对\n')

console.log('▶ 场景 C：运行时手写 h() —— 没有 patchFlag，只能全量 diff')
const r1 = h('div', { class: 'a', style: 'color:red', id: 'x' }, 'hello')
const r2 = h('div', { class: 'a', style: 'color:blue', id: 'x' }, 'hello')
mount(r1, container)
console.log('  执行 patch(r1, r2)：')
patch(r1, r2)
console.log('  ⚠️ 6 次属性比对才找到变化 —— 这就是为什么模板能比手写 h 更快')
