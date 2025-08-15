import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import GitHubProvider from "next-auth/providers/github"
import EmailProvider from "next-auth/providers/email"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { sendMagicLinkEmail, sendPasswordResetEmail } from "@/lib/email"
import { initializeServices } from "@/lib/services"

// Initialize services on module load
initializeServices()

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: process.env.EMAIL_SERVER_PORT,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
      sendVerificationRequest: async ({ identifier: email, url }) => {
        await sendMagicLinkEmail(email, url)
      },
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await db.user.findUnique({
          where: {
            email: credentials.email
          }
        })

        if (!user || !user.password) {
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )

        if (!isPasswordValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/auth/signin",
    signOut: "/auth/signout",
    error: "/auth/error",
    verifyRequest: "/auth/verify-request",
    newUser: "/auth/new-user"
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        token.accessToken = account.access_token
        token.id = user.id
      }

      if (token) {
        const dbUser = await db.user.findUnique({
          where: {
            id: token.sub || token.id
          },
          include: {
            subscription: true
          }
        })

        if (dbUser) {
          token.subscription = dbUser.subscription
          token.role = dbUser.role
        }
      }

      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub || token.id
        session.user.accessToken = token.accessToken
        session.user.subscription = token.subscription
        session.user.role = token.role
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`
      else if (new URL(url).origin === baseUrl) return url
      return baseUrl
    }
  },
  events: {
    async signIn({ user, account, profile }) {
      // Log sign-in events
      console.log(`User signed in: ${user.email}`)
    },
    async signOut({ session, token }) {
      // Log sign-out events
      console.log(`User signed out: ${session.user?.email}`)
    },
    async createUser({ user }) {
      // Send welcome email
      if (user.email) {
        // await sendWelcomeEmail(user.email)
      }
    },
    async updateUser({ user }) {
      // Handle user updates
      console.log(`User updated: ${user.email}`)
    },
    async linkAccount({ user, account, profile }) {
      // Handle account linking
      console.log(`Account linked for user: ${user.email}`)
    },
    async session({ session }) {
      // Handle session events
      console.log(`Session created for user: ${session.user?.email}`)
    }
  },
  debug: process.env.NODE_ENV === "development",
  secret: process.env.NEXTAUTH_SECRET,
}