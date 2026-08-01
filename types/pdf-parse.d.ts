declare module 'pdf-parse' {
  interface PDFData {
    text: string;
    numpages: number;
    info: Record<string, any>;
    metadata: Record<string, any>;
    version: string;
  }
  function pdfParse(data: Buffer | Uint8Array, options?: any): Promise<PDFData>;
  export default pdfParse;
}
