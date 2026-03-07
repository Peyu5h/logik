import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import ReactQueryProvider from "~/components/providers/ReactQueryProvider";
import { Toaster } from "~/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Logistix",
  description: "Agentic AI for Logistics & Supply Chain Operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <ReactQueryProvider>{children}</ReactQueryProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
