import type { ParsedAction } from '@/types/action'
import { t, type Locale } from '@/lib/line/i18n'

function dayLine(action: ParsedAction): string {
  return action.dayLabel ? `📅 ${action.dayLabel}` : ''
}

function fieldLabel(locale: Locale, field?: string): string {
  return field === 'members' ? t(locale, 'fieldMembers')
    : field === 'budget' ? t(locale, 'fieldBudget')
    : t(locale, 'fieldTransport')
}

export function confirmationText(action: ParsedAction, locale: Locale): string {
  const lines: string[] = [`${t(locale, 'confirmHeader')}\n`]

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
      lines.push(t(locale, 'lblAdd'))
      if (dayLine(action)) lines.push(dayLine(action))
      lines.push(`${action.time ?? ''} ${action.title ?? ''}`.trim())
      break
    case 'delete':
      lines.push(t(locale, 'lblDelete'))
      lines.push(action.eventTitle || '')
      if (dayLine(action)) lines.push(dayLine(action))
      break
    case 'move':
      lines.push(t(locale, 'lblMove'))
      lines.push(`${action.eventTitle || ''} → ${action.targetDayLabel || ''}`)
      break
    case 'trip_update':
      lines.push(`✏️ ${fieldLabel(locale, action.tripField)}`)
      lines.push(`→ ${action.tripValue ?? ''}`)
      break
  }

  lines.push(t(locale, 'confirmFooter'))
  return lines.join('\n')
}

export function successText(action: ParsedAction, locale: Locale): string {
  const day = action.dayLabel ? ` [${action.dayLabel}]` : ''
  switch (action.action) {
    case 'update':
      if (action.delayMinutes) {
        const sign = action.delayMinutes > 0 ? '+' : ''
        return t(locale, 'okUpdateDelay', { title: action.eventTitle ?? '', day, sign, n: String(action.delayMinutes) })
      }
      return t(locale, 'okUpdateTime', { title: action.eventTitle ?? '', day, time: action.time ?? '' })
    case 'create':
      return t(locale, 'okCreate', { title: action.title ?? '', day })
    case 'delete':
      return t(locale, 'okDelete', { title: action.eventTitle ?? '', day })
    case 'move':
      return t(locale, 'okMove', { title: action.eventTitle ?? '', target: action.targetDayLabel ?? '' })
    case 'trip_update':
      return t(locale, 'okTripUpdate', { field: fieldLabel(locale, action.tripField), value: String(action.tripValue ?? '') })
    default:
      return t(locale, 'okDone')
  }
}
