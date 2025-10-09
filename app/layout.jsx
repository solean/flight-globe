import './globals.css';

export const metadata = {
  title: 'Flights Globe',
  description: 'Interactive globe of flights rendered with Globe.gl and D3'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
