/**
 * Vite's `?raw` import.
 *
 * Lets a test assert on a file the Worker itself cannot read — there is no `fs`
 * inside workerd, so the content is inlined at transform time. It lives in its
 * own file because a wildcard module declaration is only ambient in a
 * declaration file that is not itself a module.
 */
declare module "*?raw" {
  const content: string;
  export default content;
}
