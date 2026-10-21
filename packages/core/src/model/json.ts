/** A JSON-serializable value: what analyses return and reports contain. */
export type Json =
  null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
