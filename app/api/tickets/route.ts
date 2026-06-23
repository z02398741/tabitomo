import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File
  const eventId = formData.get('event_id') as string
  const name = formData.get('name') as string

  if (!file || !eventId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = getAdmin()
  const userId = (session.user as any).id
  const ext = file.name.split('.').pop()
  const path = `${userId}/${eventId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('tickets')
    .upload(path, file, { contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: ticket, error } = await supabase
    .from('tickets')
    .insert({ event_id: eventId, name, storage_path: path })
    .select()
    .single()

  if (error) {
    console.error('Ticket insert error:', error)

    return NextResponse.json(
      {
        error: error.message,
        details: error
      },
      { status: 500 }
    )
  }

  return NextResponse.json(ticket)
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id')
  if (!eventId) {
    return NextResponse.json({ error: 'Missing event_id' }, { status: 400 })
  }

  const supabase = getAdmin()
  const { data: tickets } = await supabase
    .from('tickets')
    .select('*')
    .eq('event_id', eventId)

  return NextResponse.json(tickets || [])
}
