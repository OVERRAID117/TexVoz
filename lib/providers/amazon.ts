// PASO 2 — Aquí irá la integración con Amazon Polly
// Docs: https://docs.aws.amazon.com/polly/

export async function synthesizeAmazon(
  _text: string,
  _voice: string,
  _speed: number
): Promise<Buffer> {
  throw new Error('Amazon Polly — pendiente de implementar en Paso 2')
}
