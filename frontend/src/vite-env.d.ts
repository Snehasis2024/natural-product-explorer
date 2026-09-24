/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_ENGINE?: 'auto' | 'api' | 'browser';
  readonly VITE_API_URL?: string;
}
declare module '@rdkit/rdkit' {
  const init: (opts?: { locateFile?: (f: string) => string }) => Promise<any>;
  export default init;
}
