import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { Toast } from "@heroui/react"
import { AuthProvider } from "@/components/auth-provider"
import { ThemeProvider } from "@/components/theme-provider"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
    >
      <body>
        <ThemeProvider>
          <AuthProvider>
            {children}
            <Toast.Provider placement="bottom end" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

