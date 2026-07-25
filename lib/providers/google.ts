// PASO 2 — Aquí irá la integración con Google Cloud TTS
// Docs: https://cloud.google.com/text-to-speech

export async function synthesizeGoogle(
  _text: string,
  _voice: string,
  _speed: number
): Promise<Buffer> {
  throw new Error('Google TTS — pendiente de implementar en Paso 2')
}
