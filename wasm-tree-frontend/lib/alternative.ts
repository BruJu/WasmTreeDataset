import { ForestOfIdentifierQuads } from '@bruju/wasm-tree-backend';
import { Quad, Term } from 'rdf-js';
import { TermIdMap, WasmTreeDatasetIterator, WasmTreeLike } from './termidmap';

// This module contains implementations that uses either the identifierList
// cache strategy or the shared term-id map strategy.
//
// In most application, you should use Dataset instead, or in some rare cases
// AlwaysForestDataset
//
// Also note that even if you have the FinalizationRegistry, these structures
// won't be freed automatically


/**
 * A RDF.JS DatasetCore that resorts on a wasm exported structure
 * to manage its quads.
 * 
 * Unlike WasmTreeDataset, this class doesn't use any cache process
 * (identifierList) and doesn't share its termIdMap with other instances.
 * 
 * In general case, WasmTreeDataset should be prefered to this class.
 */
export class AlwaysForestDataset implements WasmTreeLike {
  termIdMap: TermIdMap;
  forest: ForestOfIdentifierQuads | undefined;

  /**
   * Constructs a AlwaysForestDataset
   * 
   * identifierList and forest arguments are used only if a termIdMap is provided
   * @param termIdMap If provided, the TermIdMap to duplicate
   * @param identifierList If provided, some numbers that represents the quads.
   */
  constructor(termIdMap?: TermIdMap, identifierList?: Uint32Array) {
    if (identifierList != undefined) {
      this.forest = ForestOfIdentifierQuads.fromIdentifierList(identifierList);
      this.termIdMap = TermIdMap.duplicate(termIdMap!, identifierList);
    } else {
      this.forest = new ForestOfIdentifierQuads();
      this.termIdMap = new TermIdMap();
    }
  }

  /**
   * Ensure a forest is instanciated.
   * 
   * It is usefull if the user frees an instance and then reuse it.
   */
  _ensureHasForest() {
    if (this.forest === undefined) {
      this.forest = new ForestOfIdentifierQuads();
    }
  }

  /**
   * Liberates the memory allocated by Web Assembly for the forest and empties
   * the dataset
   */
  free() {
    if (this.forest !== undefined) {
      this.forest.free();
      this.forest = undefined;
    }
  }

  // ========================================================================
  // ==== RDF.JS DatasetCore Implementation
  // ==== https://rdf.js.org/dataset-spec/#datasetcore-interface

  /**
   * Returns the number of contained elements.
   */
  get size() {
    if (this.forest !== undefined) {
      return this.forest.size();
    } else {
      return 0;
    }
  }

  [Symbol.iterator]() {
    return new WasmTreeDatasetIterator(this);
  }

  add(quad: Quad) {
    this._ensureHasForest();

    let identifierQuad = this.termIdMap.convertToIdentifierQuad(quad);
    this.forest!.add(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
    return this;
  }

  delete(quad: Quad) {
    let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

    if (identifierQuad !== null) {
      this._ensureHasForest();
      this.forest!.remove(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
    }

    return this;
  }

  has(quad: Quad) {
    let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

    if (identifierQuad === null) {
      return false;
    } else {
      this._ensureHasForest();
      return this.forest!.has(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
    }
  }

  /**
   * Returns a new dataset with the specified subject, predicate, object and
   * graph, if provided
   * @param subject The subject or null
   * @param predicate The predicate or null
   * @param object The object or null
   * @param graph The graph or null
   */
  match(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null) {
    // Rewrite match parameters with identifiers
    let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
    if (matchResult === null) {
      return new AlwaysForestDataset(this.termIdMap);
    }

    // Match is valid
    this._ensureHasForest();
    let identifierList = this.forest!.get_all(
      matchResult[0], matchResult[1], matchResult[2], matchResult[3]
    );
    return new AlwaysForestDataset(this.termIdMap, identifierList);
  }

  /**
   * Returns an identifier list with every quads in a format of an array of
   * integers `[s1, p1, o1, g1, s2, p2, o2, g3, ..., sn, pn, on, gn]`
   * where s1 is the subject of the first quad, p1 the predicate of the first
   * quad, ... and gn the graph of the last quad.
   */
  _asIdentifierList(): Uint32Array {
    if (this.forest === undefined) {
      return Uint32Array.from([]);
    } else {
      return this.forest.get_all(undefined, undefined, undefined, undefined);
    }
  }

  /**
   * Returns an array with the quads in this dataset
   */
  toArray(): Quad[] {
    return [...this];
  }

  // ==== OTHER FUNCTIONS

  /**
   * Returns the number of quads that will match the given pattern
   * May be used for SPARQL query planning
   * 
   * @param subject Required subject or null 
   * @param predicate Required predicate or null
   * @param object Required object or null
   * @param graph Required graph or null
   */
  countQuads(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null) {
    if (this.forest === undefined) return 0;

    let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
    if (matchResult == null) {
      return 0;
    } else {
      this._ensureHasForest();
      return this.forest!.matchCount(matchResult[0], matchResult[1], matchResult[2], matchResult[3]);
    }
  }

  /**
   * Returns the number of trees that are currently used
   */
  getNumberOfLivingTrees() {
    if (this.forest !== undefined) {
      return this.forest.getNumberOfLivingTrees();
    } else {
      return 0;
    }
  }

  /**
   * If the optimal index to answer the match request for the given pattern is not built,
   * build it
   */
  ensureHasIndexFor(
    subject?: Term | boolean | null,
    predicate?: Term | boolean | null,
    object?: Term | boolean | null,
    graph?: Term | boolean | null
  ) {
    this._ensureHasForest();
    this.forest!.ensureHasIndexfor(!!subject, !!predicate, !!object, !!graph);
  }
}

export class DatasetWithIdentifierList implements WasmTreeLike {
  termIdMap: TermIdMap;
  forest: ForestOfIdentifierQuads | undefined;
  identifierList: Uint32Array | undefined;

  constructor(termIdMap?: TermIdMap, identifierList: Uint32Array | null = null, forest?: ForestOfIdentifierQuads) {
    if (termIdMap === undefined) {
      this.termIdMap = new TermIdMap();
      this.forest = new ForestOfIdentifierQuads();
      this.identifierList = undefined;
    } else {
      this.termIdMap = TermIdMap.duplicate(termIdMap, identifierList!);
      this.forest = forest == null ? undefined : forest;
      this.identifierList = identifierList == null ? undefined : identifierList;
    }
  }

  _ensureHasForest() {
    if (this.forest === undefined) {
      if (this.identifierList !== undefined) {
        this.forest = ForestOfIdentifierQuads.fromIdentifierList(this.identifierList);
      } else {
        this.forest = new ForestOfIdentifierQuads();
      }
    }
  }

  _ensureHasModifiableForest() {
    this._ensureHasForest();
    this.identifierList = undefined;
  }

  free() {
    if (this.forest !== undefined) {
      this.forest.free();
      this.forest = undefined;
    }

    this.identifierList = undefined;
  }

  get size() {
    if (this.identifierList !== undefined) {
      return this.identifierList.length / 4;
    } else if (this.forest !== undefined) {
      return this.forest.size();
    } else {
      return 0;
    }
  }

  [Symbol.iterator]() {
    return new WasmTreeDatasetIterator(this);
  }

  add(quad: Quad) {
    this._ensureHasModifiableForest();

    let identifierQuad = this.termIdMap.convertToIdentifierQuad(quad);
    this.forest!.add(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
    return this;
  }

  delete(quad: Quad) {
    let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

    if (identifierQuad !== null) {
      this._ensureHasModifiableForest();
      this.forest!.remove(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
    }

    return this;
  }

  has(quad: Quad): boolean {
    let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

    if (identifierQuad === null) {
      return false;
    } else {
      this._ensureHasForest();
      return this.forest!.has(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
    }
  }

  match(subject: Term, predicate: Term, object: Term, graph: Term) {
    // Rewrite match parameters with identifiers
    let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
    if (matchResult === null) {
      return new DatasetWithIdentifierList(this.termIdMap);
    }

    // Match is valid
    this._ensureHasForest();
    let identifierList = this.forest!.get_all(
      matchResult[0], matchResult[1], matchResult[2], matchResult[3]
    );
    return new DatasetWithIdentifierList(this.termIdMap, identifierList);
  }

  _asIdentifierList(): Uint32Array {
    if (this.identifierList === undefined) {
      if (this.forest === undefined) return Uint32Array.from([]);

      this.identifierList = this.forest.get_all(undefined, undefined, undefined, undefined);
    }

    return this.identifierList;
  }

  toArray(): Quad[] {
    return [...this];
  }

  ensureHasIndexFor(
    subject?: Term | boolean | null,
    predicate?: Term | boolean | null,
    object?: Term | boolean | null,
    graph?: Term | boolean | null
  ) {
    this._ensureHasForest();
    this.forest!.ensureHasIndexfor(!!subject, !!predicate, !!object, !!graph);
  }
}

export class DatasetWithSharedTermIdMap implements WasmTreeLike {
  forest: ForestOfIdentifierQuads | undefined;
  termIdMap: TermIdMap;

  constructor(termIdMap?: TermIdMap, identifierList?: Uint32Array | undefined) {
    if (identifierList !== undefined) {
      this.forest = ForestOfIdentifierQuads.fromIdentifierList(identifierList);
      this.termIdMap = termIdMap!;
    } else {
      this.forest = new ForestOfIdentifierQuads();
      this.termIdMap = new TermIdMap();
    }
  }

  _ensureHasForest() {
    if (this.forest === undefined) {
      this.forest = new ForestOfIdentifierQuads();
    }
  }

  free() {
    if (this.forest !== undefined) {
      this.forest.free();
      this.forest = undefined;
    }
  }

  get size() {
    if (this.forest !== undefined) {
      return this.forest.size();
    } else {
      return 0;
    }
  }

  [Symbol.iterator]() {
    return new WasmTreeDatasetIterator(this);
  }

  add(quad: Quad) {
    this._ensureHasForest();

    let identifierQuad = this.termIdMap.convertToIdentifierQuad(quad);
    this.forest!.add(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
    return this;
  }

  delete(quad: Quad) {
    let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

    if (identifierQuad !== null) {
      this._ensureHasForest();
      this.forest!.remove(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
    }

    return this;
  }

  has(quad: Quad) {
    let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

    if (identifierQuad === null) {
      return false;
    } else {
      this._ensureHasForest();
      return this.forest!.has(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
    }
  }

  match(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null) {
    // Rewrite match parameters with identifiers
    let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
    if (matchResult === null) {
      return new DatasetWithSharedTermIdMap(this.termIdMap);
    }

    // Match is valid
    this._ensureHasForest();
    let identifierList = this.forest!.get_all(
      matchResult[0], matchResult[1], matchResult[2], matchResult[3]
    );
    return new DatasetWithSharedTermIdMap(this.termIdMap, identifierList);
  }

  _asIdentifierList() {
    if (this.forest === undefined) {
      return Uint32Array.of();
    } else {
      return this.forest.get_all(undefined, undefined, undefined, undefined);
    }
  }

  toArray(): Quad[] {
    return [...this];
  }

  ensureHasIndexFor(
    subject?: Term | boolean | null,
    predicate?: Term | boolean | null,
    object?: Term | boolean | null,
    graph?: Term | boolean | null
  ) {
    this._ensureHasForest();
    this.forest!.ensureHasIndexfor(!!subject, !!predicate, !!object, !!graph);
  }
}
