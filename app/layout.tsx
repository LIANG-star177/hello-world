import "./globals.css";
import "leaflet/dist/leaflet.css";
export const metadata = {
  title: "Present · Classroom attendance",
  description: "Fast classroom attendance with rotating QR codes",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
