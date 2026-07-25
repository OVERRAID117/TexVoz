import { PromptVariables } from "./types";
import { PromptLoader } from "../loader/PromptLoader";

export class PromptBuilder {
  private loader = new PromptLoader();

  build(data: PromptVariables): string {
    const biblia = this.loader.load("TEXVOZLAB_IA_BIBLIA_v3.1.md");
    const promptMaestro = this.loader.load("PROMPT_MAESTRO_V3.1.md");

    const prompt = promptMaestro
      .replace("{{HERRAMIENTA}}", data.herramienta)
      .replace("{{CONFIGURACION}}", data.configuracion)
      .replace("{{IDIOMA}}", data.idioma)
      .replace("{{DOCUMENTO}}", data.documento);

    return `${biblia}\n\n${prompt}`;
  }
}
