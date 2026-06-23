import NextAuth, { NextAuthOptions } from 'next-auth'
import LineProvider from 'next-auth/providers/line'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const authOptions: NextAuthOptions = {
  providers: [
    LineProvider({
      clientId: process.env.LINE_LOGIN_CHANNEL_ID!,
      clientSecret: process.env.LINE_LOGIN_CHANNEL_SECRET!,
    })
  ],

  session: {
    strategy: 'jwt',
  },

  callbacks: {
    async signIn({ user, profile }) {
      const p = profile as Record<string, unknown> | undefined
      const id = (p?.sub as string | undefined) || user.id
      if (id) {
        await getAdmin().from('user_profiles').upsert({
          id,
          name: user.name ?? null,
          image: user.image ?? null,
          updated_at: new Date().toISOString(),
        })
      }
      return true
    },

    async jwt({ token, profile }) {
      if (profile) {
        token.sub = (profile as any).sub
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub
      }
      return session
    }
  },

  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
