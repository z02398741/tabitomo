import type { ParsedAction } from '@/types/action'

export function confirmationText(action: ParsedAction): string {
  const lines: string[] = ['✏️ 行程確認\n']

  switch (action.action) {
    case 'update':
      lines.push(action.eventTitle || '')
      if (action.delayMinutes) {
        lines.push(`⏱ ${action.delayMinutes}分後ろへ延長`)
      } else {
        lines.push(`${action.oldTime ?? '??:??'} → ${action.time ?? '??:??'}`)
      }
      break
    case 'create':
      lines.push(`➕ 新增`)
      lines.push(`${action.time ?? ''} ${action.title ?? ''}`.trim())
      break
    case 'delete':
      lines.push(`🗑️ 取消`)
      lines.push(action.eventTitle || '')
      break
    case 'move':
      lines.push(`📦 移動`)
      lines.push(`${action.eventTitle || ''} → ${action.targetDayLabel || ''}`)
      break
  }

  lines.push('\n請回覆：確認 / 取消')
  return lines.join('\n')
}

export function successText(action: ParsedAction): string {
  switch (action.action) {
    case 'update':
      if (action.delayMinutes) return `✅ ${action.eventTitle} を ${action.delayMinutes}分 後ろへ変更しました`
      return `✅ ${action.eventTitle} を ${action.time} に変更しました`
    case 'create':
      return `✅ 新增了 ${action.title}`
    case 'delete':
      return `✅ 已取消 ${action.eventTitle}`
    case 'move':
      return `✅ ${action.eventTitle} を ${action.targetDayLabel} へ移動しました`
    default:
      return '✅ 完成'
  }
}
