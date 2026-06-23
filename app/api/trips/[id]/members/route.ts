import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MAX_MEMBERS = 20

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/trips/[id]/members — list members with profiles
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: tripId } = await params
  const supabase = getAdmin()

  const { data, error } = await supabase
    .from('trip_members')
    .select('user_id, role, user_profiles(name, image)')
    .eq('trip_id', tripId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const members = (data ?? []).map((m: any) => ({
    userId: m.user_id,
    role: m.role,
    name: m.user_profiles?.name ?? null,
    image: m.user_profiles?.image ?? null,
  }))

  return NextResponse.json({ members, max: MAX_MEMBERS })
}

// DELETE /api/trips/[id]/members?userId=xxx — remove a member (owner only)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: tripId } = await params
  const ownerId = (session.user as any).id
  const { searchParams } = new URL(req.url)
  const targetUserId = searchParams.get('userId')
  if (!targetUserId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const supabase = getAdmin()

  // Verify requester is owner
  const { data: ownerRow } = await supabase
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', ownerId)
    .single()

  if (ownerRow?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Cannot remove the owner themselves
  if (targetUserId === ownerId) {
    return NextResponse.json({ error: 'Cannot remove owner' }, { status: 400 })
  }

  await supabase
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', targetUserId)

  return new NextResponse(null, { status: 204 })
}
