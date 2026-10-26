import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import AppShell from "@/components/app-shell";
import { getRoleLabel, getSession } from "@/lib/auth";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GUSA AI Operating System",
  description: "AI-powered business operating platform dashboard",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = getSession(await cookies());
  const user = session ? { name: session.name, role: session.role, roleLabel: getRoleLabel(session.role) } : null;

  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
