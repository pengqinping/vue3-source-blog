/**
 * 05 · mini-compiler：模板字符串 → AST → transform → render 函数
 * 对应文章：05《编译器全景：parse / transform / codegen 三步走》
 * 运行：node demos/05-mini-compiler.mjs
 *
 * 一个极简但结构真实的编译器（对照 compiler-core 的三阶段）：
 *   parse：    模板字符串 → AST（描述结构）
 *   transform：AST → 带优化信息的 AST（静态标记 / patchFlag）
 *   codegen：  AST → render 函数源码字符串（eval 后真实可执行）
 */

const template = `
<div id="app">
  <p>静态文字，永远不变</p>
  <p>你好，{{ name }}</p>
  <span v-if="ok">动态开关</span>
</div>`

// ---------- 1. parse：锚定式扫描，构建 AST ----------
function parse(tpl) {
  const root = { type: 'Root', children: [] }
  const stack = [root]
  let rest = tpl.trim()
  while (rest.length) {
    if (rest.startsWith('</')) {                    // 闭合标签 → 弹栈
      rest = rest.replace(/^<\/[\w-]+>\s*/, '')
      stack.pop()
    } else if (/^<[\w-]+/.test(rest)) {             // 开始标签 → 建 Element 入栈
      const m = rest.match(/^<([\w-]+)([^>]*)>/)
      const el = { type: 'Element', tag: m[1], props: {}, children: [], patchFlag: 0 }
      for (const attr of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
        el.props[attr[1]] = attr[2] ?? true
      }
      stack[stack.length - 1].children.push(el)
      stack.push(el)
      rest = rest.slice(m[0].length)
    } else if (rest.startsWith('{{')) {             // 插值表达式
      const end = rest.indexOf('}}')
      stack[stack.length - 1].children.push({ type: 'Interpolation', content: rest.slice(2, end).trim() })
      rest = rest.slice(end + 2)
    } else {                                        // 文本（吃到下一个 < 或 {{ 为止）
      const i = rest.search(/<|\{\{/)
      const text = i === -1 ? rest : rest.slice(0, i)
      if (text.trim()) stack[stack.length - 1].children.push({ type: 'Text', content: text.trim() })
      rest = i === -1 ? '' : rest.slice(i)
    }
  }
  return root
}

// ---------- 2. transform：静态提升 + patchFlag（对照 transforms/transformHoist 等） ----------
const PatchFlags = { TEXT: 1, PROPS: 8 } // 与真实 patchFlag 数值一致
function transform(ast) {
  const ctx = { hoisted: [] }
  const walk = node => {
    if (node.type === 'Element') {
      const onlyText = node.children.every(c => c.type === 'Text' || c.type === 'Interpolation')
      const hasDynamic = node.children.some(c => c.type === 'Interpolation')
      const hasVIf = 'v-if' in node.props
      // 只有纯文字内容且有插值 → 标 TEXT：运行时只更新文字
      if (onlyText && hasDynamic) node.patchFlag = PatchFlags.TEXT
      // 无插值、无 v-if、无嵌套元素 → 整个节点静态，可提升到 render 外面
      if (!hasDynamic && !hasVIf && node.children.every(c => c.type === 'Text')) {
        node.isStatic = true
        ctx.hoisted.push(node)
      }
    }
    if (node.type === 'Interpolation') node.patchFlag = PatchFlags.TEXT
    node.children?.forEach(walk)
  }
  walk(ast)
  return ctx
}

// ---------- 3. codegen：AST → render 函数字符串（对照 codegen.ts） ----------
function codegen(ast, ctx) {
  const gen = (node, inHoist = false) => {
    switch (node.type) {
      case 'Text':
        return `t(${JSON.stringify(node.content)})`
      case 'Interpolation':
        return `t(ctx.${node.content})`
      case 'Element': {
        // 静态节点 → 在 render 函数体里引用提升常量，复用同一个对象
        if (node.isStatic && !inHoist) return `_hoisted_${ctx.hoisted.indexOf(node)}`
        const isVIf = 'v-if' in node.props
        const props = Object.entries(node.props)
          .filter(([k]) => k !== 'v-if')
          .map(([k, v]) => `${JSON.stringify(k)}: ${v === true ? 'true' : JSON.stringify(v)}`)
          .join(', ')
        const propsStr = Object.keys(props).length ? `{ ${props} }` : 'null'
        const children = node.children.map(c => gen(c, inHoist)).join(', ')
        const flag = node.patchFlag ? `, ${node.patchFlag}` : ''
        const code = `h(${JSON.stringify(node.tag)}, ${propsStr}, [${children}]${flag})`
        // v-if 编译成三元表达式：条件为假 → 空数组（什么都不渲染）
        return isVIf ? `...(ctx.${node.props['v-if']} ? [${code}] : [])` : code
      }
      default: return ''
    }
  }
  const hoistDefs = ctx.hoisted
    .map((n, i) => `const _hoisted_${i} = /* 静态提升 */ ${gen(n, true)}`)
    .join('\n')
  // Root 的第一个孩子就是模板的根元素，直接作为 render 的返回值
  const body = ast.children.map(n => gen(n)).join(', ')
  return `${hoistDefs}
function render(ctx) {
  return ${body}
}`
}

// ---------- 4. 运行时微内核：h / t，让生成代码真的能跑 ----------
function h(type, props, children, patchFlag) { return { type, props, children, patchFlag } }
function t(text) { return String(text) }
const runtime = { h, t }

// ============ 演示：完整流水线 ============
console.log('▶ 第 1 步 parse：模板 → AST（节选）')
const ast = parse(template)
console.log(JSON.stringify(ast.children[0].children, null, 1).slice(0, 900))

console.log('\n▶ 第 2 步 transform：标记静态节点 + patchFlag')
const ctx = transform(ast)
console.log(`  静态提升节点数：${ctx.hoisted.length}（运行时只创建一次，反复复用）`)
ast.children[0].children.forEach(el => {
  if (el.type === 'Element') {
    console.log(`  <${el.tag}> → patchFlag=${el.patchFlag}, isStatic=${!!el.isStatic}, v-if=${'v-if' in el.props}`)
  }
})

console.log('\n▶ 第 3 步 codegen：AST → render 函数源码')
const code = codegen(ast, ctx)
console.log(code)

console.log('\n▶ 第 4 步：eval 生成代码，跑起来')
const renderFn = new Function('runtime', 'ctx', `const {h,t} = runtime;\n${code}\nreturn render(ctx)`)
console.log('  ctx = { name: "小明", ok: true } →')
console.log(JSON.stringify(renderFn(runtime, { name: '小明', ok: true }), null, 1))
console.log('  ctx = { name: "小明", ok: false } →（v-if 生效，span 消失）')
console.log(JSON.stringify(renderFn(runtime, { name: '小明', ok: false }), null, 1))
console.log('\n✅ 模板 → AST → transform → codegen → render → vnode，全链路打通')
