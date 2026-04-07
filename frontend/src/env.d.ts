interface ImportMetaEnv {
  readonly VITE_DEFAULT_API: string;
  readonly VITE_NGINX_API: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}