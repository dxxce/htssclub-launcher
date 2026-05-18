import type { Metadata } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: "HTSS Club",
  description: "HTSS Club Launcher",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${quicksand.variable} h-full antialiased`}
    >
      <body className="h-full flex bg-[#030305] text-white overflow-hidden selection:bg-purple-500/30 font-sans">
        <main 
          className="flex-1 h-full w-full relative bg-[#030305] overflow-hidden"
        >
          {children}
        </main>
      </body>
    </html>
  );
}
