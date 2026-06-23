export type LineSource = {
  type: string
  userId?: string
  groupId?: string
}

export type LineMessageEvent = {
  type: 'message'
  replyToken: string
  source: LineSource
  message: {
    id: string
    type: string
    text: string
    mention?: {
      mentionees: Array<{ isSelf?: boolean; userId?: string }>
    }
  }
}
