const TOKEN = () => process.env.LINE_MESSAGING_ACCESS_TOKEN!

export async function replyMessage(replyToken: string, messages: object[]) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN()}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  })
  if (!res.ok) console.error('LINE reply error:', res.status, await res.text())
}

export function textMsg(text: string) {
  return { type: 'text', text }
}

export function quickReplyMsg(
  text: string,
  items: Array<{ label: string; text: string }>
) {
  return {
    type: 'text',
    text,
    quickReply: {
      items: items.slice(0, 13).map(({ label, text: t }) => ({
        type: 'action',
        action: { type: 'message', label: label.slice(0, 20), text: t },
      })),
    },
  }
}
