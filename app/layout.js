import { Sora, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import AppProvider from "@/components/AppProvider";

const sora = Sora({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-sora", display: "swap" });
const source = Source_Sans_3({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-source", display: "swap" });

export const metadata = {
  title: "Crust House Cash Book",
  description: "Daily sale, expenses, riders, employees, vendors, capital and month-end closing for Crust House Commercial.",
};

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sora.variable} ${source.variable}`}>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
