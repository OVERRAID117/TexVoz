import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'VozEstudio — Texto a Voz para Estudiantes',
  description: 'Convierte cualquier texto en audio en segundos. Gratis, sin registro.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
