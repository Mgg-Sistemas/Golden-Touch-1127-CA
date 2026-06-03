/* html2canvas 1.4.1 trae sus tipos en dist/types pero no los expone vía
   package.json#types, así que declaramos la firma mínima que usamos. */
declare module 'html2canvas' {
  export interface Html2CanvasOptions {
    backgroundColor?: string | null;
    scale?: number;
    useCORS?: boolean;
    logging?: boolean;
    width?: number;
    height?: number;
    windowWidth?: number;
    windowHeight?: number;
    scrollX?: number;
    scrollY?: number;
    [key: string]: unknown;
  }
  const html2canvas: (element: HTMLElement, options?: Html2CanvasOptions) => Promise<HTMLCanvasElement>;
  export default html2canvas;
}
