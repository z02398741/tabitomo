import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getWeather } from '@/lib/weather'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q) {
    return NextResponse.json({ error: 'Missing q' }, { status: 400 })
  }

  const result = await getWeather(q)
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' },
  })
}
