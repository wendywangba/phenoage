// The minified legacy build has the same API as pdf.mjs, which ships its own types.
declare module "pdfjs-dist/legacy/build/pdf.min.mjs" {
  export * from "pdfjs-dist/legacy/build/pdf.mjs";
}
