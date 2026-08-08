/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<
    Record<string, never>,
    Record<string, never>,
    Record<string, never>
  >;
  export default component;
}
declare module '*.css?inline' {
  const css: string;
  export default css;
}
