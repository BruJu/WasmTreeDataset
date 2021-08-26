import * as graphyFactory from '@graphy/core.data.factory';
import { DatasetCore, Quad, Term } from '@rdfjs/types';

export interface Concisable { concise(): string; }

/** Returns true if expr is undefined or null */
function isLikeNone<T>(expr: T | undefined | null) {
  return expr === undefined || expr === null;
}

/**
 * A class that maps terms with numbers.
 * The mapping resorts to Graphy's concise terms and Javascript maps.
 * 
 * Mapped terms are never destroyed from the map
 * 
 * Identifier Quad refers to a quad in the form of four identifiers.
 * RDF.JS Quad and Term Quad refers to a quad which contains terms: for example
 * that is object is rdf:type.
 */
export class TermIdMap {
  identifiersToTerms: (Term & Concisable)[];
  termsToIdentifiers: {[concise: string]: number};
  nextIdentifier: number;

  /**
   * Constructs a TermIdMap with the default graph as the 0th term
   */
  constructor() {
    this.identifiersToTerms = [graphyFactory.defaultGraph()];
    this.termsToIdentifiers = {};
    this.termsToIdentifiers[graphyFactory.defaultGraph().concise()] = 0;
    this.nextIdentifier = 1;
  }

  /**
   * Clone the given TermIdMap with only identifiers from the identifierList
   * @param {*} source TermIdMap to clone
   * @param {*} identifierList List of identifier to keep from source
   */
  static duplicate(source: TermIdMap, identifierList: Uint32Array): TermIdMap {
    let self = new TermIdMap();
    let identifiers = new Set(identifierList);

    for (const identifier of identifiers) {
      let term = source.identifiersToTerms[identifier];
      self.termsToIdentifiers[term.concise()] = identifier;
      self.identifiersToTerms[identifier] = term;
    }

    self.nextIdentifier = source.nextIdentifier;

    return self;
  }

  /**
   * Returns the graphy term bound to this identifier
   * @param identifier The identifier
   */
  getTerm(identifier: number) {
    return this.identifiersToTerms[identifier];
  }

  /**
   * Returns the identifier of the given term, or undefined if not mapped
   * @param term The identifier
   */
  findIdentifier(term: Term): number | undefined {
    let graphyTerm = graphyFactory.fromTerm(term);
    let concise = graphyTerm.concise();
    return this.termsToIdentifiers[concise];
  }

  /**
   * Returns the identifier of the given term. If not present, a new
   * identifier will be attributed to it and it will be returned.
   * @param term The term
   */
  findOrBuildIdentifier(term: Term): number {
    let graphyTerm = graphyFactory.fromTerm(term);
    let concise = graphyTerm.concise();
    let r = this.termsToIdentifiers[concise];
    if (r !== undefined) {
      return r;
    } else {
      let identifier = this.nextIdentifier;
      this.termsToIdentifiers[concise] = identifier;
      this.identifiersToTerms.push(graphyTerm);
      this.nextIdentifier += 1;
      return identifier;
    }
  }

  /**
   * Returns an array of four identifiers, corresponding to the terms from
   * the quad. If a term is not known yet, a new identifier will be created
   * @param termQuad A RDF.JS compliant quad
   */
  convertToIdentifierQuad(termQuad: Quad): [number, number, number, number] {
    return [
      this.findOrBuildIdentifier(termQuad.subject),
      this.findOrBuildIdentifier(termQuad.predicate),
      this.findOrBuildIdentifier(termQuad.object),
      this.findOrBuildIdentifier(termQuad.graph)
    ];
  }

  /**
   * Returns an array of four identifiers, corresponding to the terms from
   * the quad. If a term is not known yet, null will be returned.
   * @param termQuad A RDF.JS compliant quad
   */
  tryConvertToIdentifierQuad(termQuad: Quad): [number, number, number, number] | null {
    let identifierQuad = [
      this.findIdentifier(termQuad.subject),
      this.findIdentifier(termQuad.predicate),
      this.findIdentifier(termQuad.object),
      this.findIdentifier(termQuad.graph)
    ];

    if (identifierQuad.includes(undefined)) return null;
    return identifierQuad as [number, number, number, number];
  }

  /**
   * Returns a RDF.JS quad if all the passed identifiers exist in this
   * term-id map, null if one of them does not exist, returns null
   * @param spog An array of four identifiers.
   */
  getQuad(identifierQuad: [number, number, number, number]) {
    const s = this.getTerm(identifierQuad[0]);
    if (s === undefined) return null;
    const p = this.getTerm(identifierQuad[1]);
    if (p === undefined) return null;
    const o = this.getTerm(identifierQuad[2]);
    if (o === undefined) return null;
    const g = this.getTerm(identifierQuad[3]);
    if (g === undefined) return null;

    return graphyFactory.quad(s, p, o, g);
  }

  /**
   * Write in the array at position [startingPosition:startingPosition+4] the
   * identifiers of the subject, the predicate, the object and the graph of
   * the given quad.
   * 
   * This function is designe to be able to store identifiers without creating
   * a temporary array like the convertToIdentifierQuad method
   * @param array An array (or an array like structure) in which the
   * identifiers will be written
   * @param startingPosition Position where the subject identifier
   * will be written
   * @param quad The RDF.JS compliant quad
   */
  convertToIdentifierQuadInArray(
    array: number[] | Uint32Array,
    startingPosition: number,
    quad: Quad
  ) {
    array[startingPosition + 0] = this.findOrBuildIdentifier(quad.subject)
    array[startingPosition + 1] = this.findOrBuildIdentifier(quad.predicate)
    array[startingPosition + 2] = this.findOrBuildIdentifier(quad.object)
    array[startingPosition + 3] = this.findOrBuildIdentifier(quad.graph)
  }

    /**
    * Find or build an identifier for the given term quad and push them in
    * the given array
    * @param array The array to fill
    * @param quad The RDF.JS quad to insert in the list of term
    * identifiers
    */
  _convertToIdentifierQuadPushedInArray(array: number[], quad: Quad) {
    array.push(this.findOrBuildIdentifier(quad.subject));
    array.push(this.findOrBuildIdentifier(quad.predicate));
    array.push(this.findOrBuildIdentifier(quad.object));
    array.push(this.findOrBuildIdentifier(quad.graph));
  }

  /**
   * Build an array that is suitable to pass to a wasm tree that uses
   * the identifiers described by this term-id map for the intersection
   * function (or any function that results in a dataset that will contains
   * some of the quad of the original dataset and no extra quad)
   * @param dataset The other dataset
   */
  buildIdentifierListForIntersection(dataset: DatasetCore): Uint32Array {
    let array = [];

    for (const quad of dataset) {
      let quadIdentifier = this.tryConvertToIdentifierQuad(quad);
      if (quadIdentifier != null) {
        array.push(...quadIdentifier);
      }
    }

    return Uint32Array.from(array);
  }

  /**
   * Build an array that is suitable to pass to a wasm tree that uses
   * the identifiers described by this term-id map for the union function
   * (or any function that results in a dataset that will contains quads
   * from the current and/or the other dataset)
   * @param dataset The other dataset
   */
  buildIdentifierListForUnion(dataset: DatasetCore | Quad[]) {
    const size = 'length' in dataset ? dataset.length : dataset.size;
    const array = new Uint32Array(size * 4);

    let i = 0;
    for (let quad of dataset) {
      this.convertToIdentifierQuadInArray(array, i, quad);
      i += 4;
    }

    return array;
  }

  /**
   * Build an identifier list from a list of RDF.JS quads. If a term has no
   * known identifier, null is returned instead.
   * @param dataset A list of RDF.JS quads
   */
  buildIdentifierListForEquality(dataset: DatasetCore) {
    let array = [];

    for (let quad of dataset) {
      let identifiers = this.tryConvertToIdentifierQuad(quad);
      if (identifiers === null) return null;

      array.push(...identifiers);
    }

    return Uint32Array.from(array);
  }

  /**
   * Transforms the subject, predicate, object and graph received as Terms
   * into identifiers. If a matching could not be done, returns null. Else,
   * returns an array with the identifiers or null/undefined when the term
   * was already null or undefined.
   */
  matchIdentifiers(
    subject?: Term | null,
    predicate?: Term | null,
    object?: Term | null,
    graph?: Term | null
  ) {
    let s: number | undefined = undefined;
    let p: number | undefined = undefined;
    let o: number | undefined = undefined;
    let g: number | undefined = undefined;

    if (!isLikeNone(subject)) {
      s = this.findIdentifier(subject!);
      if (isLikeNone(s)) return null;
    }

    if (!isLikeNone(predicate)) {
      p = this.findIdentifier(predicate!);
      if (isLikeNone(p)) return null;
    }

    if (!isLikeNone(object)) {
      o = this.findIdentifier(object!);
      if (isLikeNone(o)) return null;
    }

    if (!isLikeNone(graph)) {
      g = this.findIdentifier(graph!);
      if (isLikeNone(g)) return null;
    }

    return [s, p, o, g]
  }
}

export interface WasmTreeLike extends DatasetCore {
  _asIdentifierList(): Uint32Array;
  get termIdMap(): TermIdMap;
};

/** An iterator on a WasmTreeDataset */
export class WasmTreeDatasetIterator implements Iterator<Quad> {
  index: number;
  data: Uint32Array;
  termIdMap: TermIdMap;
  wasmTreeDataset: DatasetCore;

  constructor(wasmTreeDataset: WasmTreeLike) {
    this.index = 0;
    this.data = wasmTreeDataset._asIdentifierList();
    this.termIdMap = wasmTreeDataset.termIdMap;
    this.wasmTreeDataset = wasmTreeDataset;
  }

  next(): { value: null, done: true } | { value: Quad, done: false } {
    if (this.index >= this.data.length) {
      return { value: null, done: true };
    } else {
      let identifierQuad: [number, number, number, number] = [
        this.data[this.index],
        this.data[this.index + 1],
        this.data[this.index + 2],
        this.data[this.index + 3]
      ];
      
      let value = this.termIdMap.getQuad(identifierQuad)!;
      this.index += 4;

      return { value: value, done: false };
    }
  }

  /**
   * Builds a new Uint32Array which contains the identifier quads read from
   * this iterator which returns true for the `quadFilterIteratee` predicate
   * when converted to a term quad.
   * 
   * Consumes the whole iterator.
   * @param quadFilterIteratee 
   */
  filterInUInt32Array(quadFilterIteratee: (quad: Quad, dataset: DatasetCore) => boolean) {
    const resultArrayLength = this.data.length - this.index;
    let resultingArray = new Uint32Array(resultArrayLength);

    // Filtering process
    let i = 0;
    while (true) {
      let it = this.next();
      if (it.done) {
        break;
      }

      if (quadFilterIteratee(it.value, this.wasmTreeDataset)) {
        // next() has been done so we don't point to this quad anymore
        // We could do a look up of the terms from it.value, but we can
        // just look back the term identifier
        resultingArray[i + 0] = this.data[this.index - 4 + 0];
        resultingArray[i + 1] = this.data[this.index - 4 + 1];
        resultingArray[i + 2] = this.data[this.index - 4 + 2];
        resultingArray[i + 3] = this.data[this.index - 4 + 3];

        i += 4;
      }
    }

    // Reducing the array
    if (i != resultArrayLength) {
      const SMALL_ARRAY_LENGTH = 256;

      if (i / 4 < resultArrayLength || (i <= SMALL_ARRAY_LENGTH)) {
        // For small resulting arrays, we copy the slice
        resultingArray = resultingArray.slice(0, i);
      } else {
        // Else we keep the same buffer but we correct the considered size
        resultingArray = resultingArray.subarray(0, i);
      }
    }

    return resultingArray;
  }

  /**
   * Builds a Uint32Array which contains the list of identifiers of the quads
   * obtained by applying the quadMapIteratee function.
   * 
   * The returned Uint32Array may contain duplicated quads depending on the
   * quadMapIteratee function.
   */
  mapInUInt32Array(quadMapIteratee: (quad: Quad, dataset: DatasetCore) => Quad) {
    let resultingArray = new Uint32Array(this.data.length - this.index);

    let i = 0;
    while (true) {
      let it = this.next();
      if (it.done) {
        break;
      }

      let mappedQuad = quadMapIteratee(it.value, this.wasmTreeDataset);
      this.termIdMap.convertToIdentifierQuadInArray(resultingArray, i, mappedQuad);
      i += 4;
    }

    return resultingArray;
  }
}
