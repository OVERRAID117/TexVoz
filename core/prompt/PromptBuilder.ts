import { PromptVariables } from "./types";
import { PromptLoader } from "../loader/PromptLoader";

export class PromptBuilder {
  private loader = new PromptLoader();

  build(data: PromptVariables): string {
    const biblia = this.loader.load("TEXVOZLAB_IA_BIBLIA_v3.1.md");
    const promptMaestro = this.loader.load("PROMPT_MAESTRO_V3.2.md");

    // Los placeholders "_REAL" son operativos y deben aparecer exactamente
    // una vez en el Prompt Maestro (sección 4). Las menciones sin sufijo en
    // otras secciones son descriptivas y no se sustituyen.
    this.assertSingleOccurrence(promptMaestro, "{{HERRAMIENTA_REAL}}");
    this.assertSingleOccurrence(promptMaestro, "{{CONFIGURACION_REAL}}");
    this.assertSingleOccurrence(promptMaestro, "{{IDIOMA_REAL}}");
    this.assertSingleOccurrence(promptMaestro, "{{DOCUMENTO_REAL}}");

    const prompt = promptMaestro
      .replaceAll("{{HERRAMIENTA_REAL}}", data.herramienta)
      .replaceAll("{{CONFIGURACION_REAL}}", data.configuracion)
      .replaceAll("{{IDIOMA_REAL}}", data.idioma)
      .replaceAll("{{DOCUMENTO_REAL}}", data.documento);

    return `${biblia}\n\n${prompt}`;
  }

  private assertSingleOccurrence(source: string, token: string): void {
    const count = source.split(token).length - 1;
    if (count !== 1) {
      throw new Error(
        `[PromptBuilder] El placeholder operativo ${token} debe aparecer exactamente 1 vez en el Prompt Maestro, pero aparece ${count} veces.`
      );
    }
  }
}
