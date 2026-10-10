/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** '1' = publicação estática somente leitura (GitHub Pages). */
  readonly VITE_ESTATICO?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_TILE_URL?: string;
  readonly VITE_TILE_ATTRIBUTION?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
