/**
 * 07 · mini-diff：Vue 3 的 diff 算法与最长递增子序列（LIS）
 * 对应文章：08《diff 算法：从双端对比到最长递增子序列》
 * 运行：node demos/07-mini-diff.mjs
 *
 * 五步走（对照 renderer.ts 的 patchKeyedChildren）：
 *   ① 从头同步：      前缀 key 相同 → 直接 patch
 *   ② 从尾同步：      后缀 key 相同 → 直接 patch
 *   ③ 中间乱序区：    建 keyToNewIndexMap
 *   ④ 遍历旧中间区：  生成 newIndexToOldIndexMap（没匹配 = 0，待挂载）
 *   ⑤ 用 LIS 求最长递增子序列：不在 LIS 里的节点才需要移动，其余原地 patch
 */

// ---------- LIS：对照 renderer.ts 的 getSequence（耐心排序，O(n log n)） ----------
function getSequence(arr) {
  const p = arr.slice()          // 记录前驱，用于回溯
  const result = [0]             // result[i] = 长度为 i+1 的递增子序列的最小结尾下标
  let resultFinalIndex = 0
  for (let i = 0; i < arr.length; i++) {
    const num = arr[i]
    if (num === 0) continue      // 0 表示「新节点」不参与 LIS
    const j = result[resultFinalIndex]
    if (arr[j] < num) {          // 大于队尾 → 直接追加（存的是「下标 i」！）
      p[i] = j
      result[++resultFinalIndex] = i
    } else {                     // 二分找第一个 >= num 的位置替换（保持 result 最优）
      let start = 0, end = resultFinalIndex
      while (start < end) {
        const mid = (start + end) >> 1
        if (arr[result[mid]] < num) start = mid + 1
        else end = mid
      }
      if (arr[result[start]] > num && start > 0) p[i] = result[start - 1]
      result[start] = i
    }
  }
  // 回溯还原真实下标序列
  let len = resultFinalIndex + 1
  const seq = new Array(len)
  let i = result[resultFinalIndex]
  while (len-- > 0) { seq[len] = i; i = p[i] }
  return seq
}

// ---------- diff 主流程（对照 patchKeyedChildren） ----------
function diff(oldChildren, newChildren) {
  let i = 0
  const e1 = oldChildren.length - 1   // 旧列表结尾
  const e2 = newChildren.length - 1   // 新列表结尾

  // ① 从头同步
  while (i <= e1 && i <= e2 && oldChildren[i].key === newChildren[i].key) {
    console.log(`  ① 头部同步：${oldChildren[i].key}（原地 patch，不动）`)
    i++
  }
  // ② 从尾同步
  let j1 = e1, j2 = e2
  while (j1 >= i && j2 >= i && oldChildren[j1].key === newChildren[j2].key) {
    console.log(`  ② 尾部同步：${oldChildren[j1].key}（原地 patch，不动）`)
    j1--; j2--
  }

  if (i > e1) {           // 旧的都同步完了，新列表剩余的全是新节点
    console.log(`  ③ 旧列表已耗尽 → 剩余新节点 ${newChildren.slice(i, j2 + 1).map(v => v.key)} 全部挂载`)
    return
  }
  if (i > e2) {           // 新的都同步完了，旧列表剩余的全是要卸载的
    console.log(`  ③ 新列表已耗尽 → 剩余旧节点 ${oldChildren.slice(i, j1 + 1).map(v => v.key)} 全部卸载`)
    return
  }

  // ③ 中间乱序区：新节点的 key -> 下标
  const keyToNewIndexMap = new Map()
  for (let k = i; k <= j2; k++) keyToNewIndexMap.set(newChildren[k].key, k)
  console.log(`  ③ 中间乱序区：keyToNewIndexMap =`, Object.fromEntries(keyToNewIndexMap))

  // ④ 遍历旧中间区，生成 newIndexToOldIndexMap
  const toBePatched = j2 - i + 1
  const newIndexToOldIndexMap = new Array(toBePatched).fill(0) // 0 = 新节点，待挂载
  let patched = 0
  for (let k = i; k <= j1; k++) {
    const oldChild = oldChildren[k]
    const newIndex = keyToNewIndexMap.get(oldChild.key)
    if (newIndex === undefined) {
      console.log(`  ④ 旧节点 ${oldChild.key} 在新列表中不存在 → 卸载`)
    } else {
      newIndexToOldIndexMap[newIndex - i] = k + 1
      patched++
      console.log(`  ④ 旧节点 ${oldChild.key} 匹配到新位置 ${newIndex}`)
    }
  }

  // ⑤ LIS：找出「不需要移动」的最长递增序列
  const increasingNewIndexSequence = getSequence(newIndexToOldIndexMap)
  console.log(`  ⑤ newIndexToOldIndexMap = [${newIndexToOldIndexMap}]（0 = 全新节点）`)
  console.log(`  ⑤ 最长递增子序列下标 = [${increasingNewIndexSequence}] → 这些节点不用动`)
  console.log(`     结论：patch/挂载 ${toBePatched} 处，其中真正要移动的只有 ${toBePatched - increasingNewIndexSequence.length} 个`)
}

// ============ 演示 ============
const v = k => ({ key: k })
console.log('▶ 演示 1：纯头尾移动，中间稳定 —— abc → cab')
diff([v('a'), v('b'), v('c')], [v('c'), v('a'), v('b')])

console.log('\n▶ 演示 2：经典乱序 + 插入 + 删除 —— abcde → acxfb')
diff([v('a'), v('b'), v('c'), v('d'), v('e')], [v('a'), v('c'), v('x'), v('f'), v('b')])

console.log('\n▶ 演示 3：局部有序最优化 —— 大部分节点相对顺序没变，只有少数需要移动')
diff([v('a'), v('b'), v('c'), v('d')], [v('a'), v('d'), v('b'), v('c')])
console.log('  LIS = [a, b, c]：Vue3 只把 d 移动一次；Vue2 双端对比则需要更多交换')
