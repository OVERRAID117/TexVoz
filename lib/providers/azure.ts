// PASO 2 — Aquí irá la integración con Azure TTS
// Proveedor: Microsoft Azure Cognitive Services - Text to Speech
// Docs: https://learn.microsoft.com/azure/cognitive-services/speech-service/

export async function synthesizeAzure(
  _text: string,
  _voice: string,
  _speed: number
): Promise<Buffer> {
  throw new Error('Azure TTS — pendiente de implementar en Paso 2')
}
