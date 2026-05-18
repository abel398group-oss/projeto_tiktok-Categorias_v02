export interface CompiledPromptOutput {
  commercialPrompt: string;
  negativePrompt: string;
  storyboardPrompt?: string;
  debug?: {
    source: "structured_prompt_engine";
    commercialPromptLength: number;
    negativePromptLength: number;
    strategySummary: any;
  };
}
