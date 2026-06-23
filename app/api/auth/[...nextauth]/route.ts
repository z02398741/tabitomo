import NextAuth, { NextAuthOptions } from 'next-auth'
import LineProvider from 'next-auth/providers/line'

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
