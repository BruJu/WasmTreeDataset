declare module '@graphy/core.data.factory' {
  import { DefaultGraph, NamedNode, Quad, Term } from '@rdfjs/types';
  interface Concisable { concise(): string; }

  export function defaultGraph(): DefaultGraph & Concisable;
  export function namedNode(name: string): NamedNode & Concisable;

  export function fromTerm(term: Term): Term & Concisable;

  export function quad(
    subject: Term,
    predicate: Term,
    object: Term,
    graph: Term,
  ): Quad;  
}
