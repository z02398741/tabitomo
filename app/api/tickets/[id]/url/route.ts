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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = getAdmin()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', id)
    .single()

  if (!ticket) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data } = await supabase.storage
    .from('tickets')
    .createSignedUrl(ticket.storage_path, 3600)

  return NextResponse.json({ url: data?.signedUrl })
}
