import type { ParsedAction } from '@/types/action'

function dayLine(action: ParsedAction): string {
  return action.dayLabel ? `📅 ${action.dayLabel}` : ''
}

export function confirmationText(action: ParsedAction): string {
  const lines: string[] = ['✏️ 行程確認\n']

  switch (action.action) {
    case 'update':
      lines.push(action.eventTitle || '')
      if (dayLine(action)) lines.push(dayLine(action))
      if (action.delayMinutes) {
        const sign = action.delayMinutes > 0 ? '+' : ''
        lines.push(`⏱ ${sign}${action.delayMinutes}分`)
      } else {
        lines.push(`${action.oldTime ?? '??:??'} → ${action.time ?? '??:??'}`)
      }
      break
    case 'create':
      lines.push(`➕ 新增`)
      if (dayLine(action)) lines.push(dayLine(action))
      lines.push(`${action.time ?? ''} ${action.title ?? ''}`.trim())
      break
    case 'delete':
      lines.push(`🗑️ 取消`)
      lines.push(action.eventTitle || '')
      if (dayLine(action)) lines.push(dayLine(action))
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
  const day = action.dayLabel ? ` [${action.dayLabel}]` : ''
  switch (action.action) {
    case 'update':
      if (action.delayMinutes) {
        const sign = action.delayMinutes > 0 ? '+' : ''
        return `✅ ${action.eventTitle}${day} を ${sign}${action.delayMinutes}分 変更しました`
      }
      return `✅ ${action.eventTitle}${day} を ${action.time} に変更しました`
    case 'create':
      return `✅ 新增了 ${action.title}${day}`
    case 'delete':
      return `✅ 已取消 ${action.eventTitle}${day}`
    case 'move':
      return `✅ ${action.eventTitle} を ${action.targetDayLabel} へ移動しました`
    default:
      return '✅ 完成'
  }
}
