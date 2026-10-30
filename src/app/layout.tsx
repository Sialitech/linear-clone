import type { Metadata } from "next";
import { Inter } from "next/font/google";
import ConvexClientProvider from "@/components/convex-client-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Linear",
  description: "Issue tracking for product teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en" className={`dark ${inter.variable}`}>
        <body className="min-h-screen bg-background font-sans text-foreground antialiased">
          <ConvexClientProvider>
            <TooltipProvider delay={300}>
              {children}
              <Toaster />
            </TooltipProvider>
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
