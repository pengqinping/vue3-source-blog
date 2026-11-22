/**
 * 09 · mini-keepalive：KeepAlive 的 LRU 缓存策略
 * 对应文章：10《内置组件：KeepAlive / Teleport / Suspense 源码解析》
 * 运行：node demos/09-mini-keepalive.mjs
 *
 * 还原 components/KeepAlive.ts 的核心数据结构：
 *   cache: Map<key, vnode>   缓存本体
 *   keys:  Set<key>          保存「最近使用顺序」（Set 有序！）
 *   命中：keys.delete(key) + keys.add(key) → 移到队尾（最近使用）
 *   超限：淘汰 keys 的第一个 → 最久未使用（LRU）
 */

class MiniKeepAlive {
  constructor({ max = 3, include = null } = {}) {
    this.max = max
    this.include = include
    this.cache = new Map()
    this.keys = new Set()
  }
  // include 匹配（源码 matches()）：组件 name 在 include 列表里才缓存
  shouldCache(name) {
    return !this.include || this.include.includes(name)
  }
  // 源码 pruneCacheEntry：从缓存里真正删除，并触发组件 deactivated
  evictOldest() {
    const oldest = this.keys.values().next().value   // Set 的第一个 = 最久没用
    this.keys.delete(oldest)
    this.cache.delete(oldest)
    console.log(`      [LRU] 缓存超限，淘汰最久未使用的 "${oldest}"`)
  }
  // 模拟一次「切换到组件 name」
  switchTo(name) {
    if (!this.shouldCache(name)) {
      console.log(`  切换到 ${name}：不在 include 里 → 不缓存，正常卸载`)
      return
    }
    if (this.cache.has(name)) {
      // 命中缓存：不重新创建，并把它移到「最近使用」队尾
      this.keys.delete(name)
      this.keys.add(name)
      console.log(`  切换到 ${name}：✅ 缓存命中（免重建，状态保留）`)
    } else {
      this.cache.set(name, { name })
      this.keys.add(name)
      console.log(`  切换到 ${name}：❄️ 首次创建，写入缓存`)
    }
    if (this.keys.size > this.max) this.evictOldest()
    console.log(`      缓存（最久未使用→最近）：[${[...this.keys].join(', ')}]`)
  }
}

// ============ 演示 ============
console.log('▶ 演示 1：LRU 淘汰（max=3）')
const ka1 = new MiniKeepAlive({ max: 3 })
for (const name of ['TabA', 'TabB', 'TabC', 'TabD']) ka1.switchTo(name)
console.log('  切回 TabA —— 已被淘汰，要重新创建：')
ka1.switchTo('TabA')
console.log('  切到 TabB —— 同样已被淘汰，重新创建（挤掉此刻最久未用的 TabC）：')
ka1.switchTo('TabB')
console.log('  现在缓存 = [TabD, TabA, TabB]，切回 TabD —— 命中并移到队尾（变成最近使用）：')
ka1.switchTo('TabD')

console.log('\n▶ 演示 2：include 白名单')
const ka2 = new MiniKeepAlive({ max: 3, include: ['UserList', 'Dashboard'] })
ka2.switchTo('UserList')
ka2.switchTo('LoginPage')
ka2.switchTo('Dashboard')
console.log('  结论：include 之外的组件完全不进缓存')
