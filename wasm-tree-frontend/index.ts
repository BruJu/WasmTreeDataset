import { WasmTreeLike } from "./lib/termidmap";

import graphyFactory from '@graphy/core.data.factory';
import { ForestOfIdentifierQuads } from '@bruju/wasm-tree-backend';
import EventEmitter from 'events';
import { Readable } from 'stream';
import { TermIdMap, WasmTreeDatasetIterator } from './lib/termidmap';
import {
  AlwaysForestDataset,
  DatasetWithIdentifierList,
  DatasetWithSharedTermIdMap
} from './lib/alternative';
import { DatasetCore, Store, Term, Quad, Stream } from "rdf-js";

/**
 * A RDF.JS DatasetCore that resorts on a wasm exported structure that
 * uses several TreeSet and an TermIdMap.
 */
class WasmTreeDataset implements WasmTreeLike, DatasetCore {
  termIdMap: TermIdMap = new TermIdMap();
  identifierList: Uint32Array | undefined = undefined;
  forest: ForestOfIdentifierQuads | undefined = undefined;

  /**
   * Build a new WasmTreeDataset instance
   * 
   * @param quads If provided, the list of quads this dataset will originally
   * contain.
   */
  constructor(quads?: Quad[]) {
    if (quads !== undefined) {
      this.addAll(quads);
    }
  }

  /**
   * Constructs a WasmTreeDataset
   * 
   * identifierList and forest arguments are used only if a termIdMap is provided
   * @param termIdMap If provided, the TermIdMap to uses
   * @param identifierList If provided, some numbers that represents the quads.
   * @param forest If provided the used forest
   */
  static _build(termIdMap?: TermIdMap, identifierList?: Uint32Array, forest?: ForestOfIdentifierQuads) {
    let instance = new WasmTreeDataset();
    if (termIdMap === undefined) {
      instance.forest = new ForestOfIdentifierQuads();
      instance.identifierList = undefined;
    } else {
      instance.termIdMap = termIdMap;
      instance.forest = forest == undefined ? undefined : forest;
      instance.identifierList = identifierList == undefined ? undefined : identifierList;
    }
    return instance;
  }

  /**
   * Falls back to the Web Assembly forest structure.
   * 
   * If an identifier list is owned, the forest will contain the same quads. Else,
   * it will be empty.
   */
  _ensureHasForest() {
    if (this.forest === undefined) {
      if (this.identifierList !== undefined) {
        this.forest = ForestOfIdentifierQuads.fromIdentifierList(this.identifierList);
      } else {
        this.forest = new ForestOfIdentifierQuads();
      }
    }
  }

  /** Ensures a forest is owned and no identifier list is owned */
  _ensureHasModifiableForest() {
    this._ensureHasForest();
    this.identifierList = undefined;
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

    this.identifierList = undefined;
  }

  /** Returns true if this dataset currently has a Web Assembly forest */
  hasForest()    { return this.forest    != undefined; }

  /**
   * Returns true if the dataset currently has a Javascript list that
   * represents the quads
   */
  hasIdentifierList() { return this.identifierList != undefined; }

  // ========================================================================
  // ==== RDF.JS DatasetCore Implementation
  // ==== https://rdf.js.org/dataset-spec/#datasetcore-interface

  /**
   * Returns the number of contained elements.
   */
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

  add(quad: Quad): this {
    this._ensureHasModifiableForest();

    let identifierQuad = this.termIdMap.convertToIdentifierQuad(quad);
    this.forest!.add(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
    return this;
  }

  delete(quad: Quad): this {
    let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

    if (identifierQuad !== null) {
      this._ensureHasModifiableForest();
      this.forest!.remove(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
    }

    return this;
  }

  has(quad: Quad): boolean {
    const identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

    if (identifierQuad === null) {
        return false;
    } else {
      // Instead of building a forest, we could create a new intermediate state
      // where the backend owns an identifierList but has not yet built any tree.
      this._ensureHasForest();
      return this.forest!.has(...identifierQuad);
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
  match(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): WasmTreeDataset {
    // Rewrite match parameters with identifiers
    let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
    if (matchResult === null) {
        return WasmTreeDataset._build(this.termIdMap);
    }

    // Match is valid
    this._ensureHasForest();
    let identifierList = this.forest!.get_all(...matchResult);
    return WasmTreeDataset._build(this.termIdMap, identifierList);
  }

  // ========================================================================
  // ==== RDF.JS Dataset Partial Implementation
  // ==== https://rdf.js.org/dataset-spec/#dataset-interface

  // == DELETE MATCHES
  // This function mainly resorts on the web assembly back end and there is
  // little to do in Javascript

  /**
   * Removes from the dataset the quad that matches the arguments using the
   * Quad Matching logic described in
   * https://rdf.js.org/dataset-spec/#quad-matching
   * @param subject The subject of the quads to remove, or null / undefined
   * @param predicate The predicate of the quads to remove, or null / undefined
   * @param object The object of the quads to remove, or null / undefined
   * @param graph The graph of the quads to remove, or null / undefined
   */
  deleteMatches(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): this {
    let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
    if (matchResult === null) {
        return this;
    }

    this._ensureHasModifiableForest();
    this.forest!.deleteMatches(matchResult[0], matchResult[1], matchResult[2], matchResult[3]);
    return this;
  }
    
  // == IDENTIFIER QUAD LIST EXPLOITATION
  // Theses functions requires Web Assembly to return an array of identifiers
  // for every quad and do all the operation in Javascript.
  //
  // They are implemented with the naive way because they heavily resorts on
  // Javascript closures

  /**
   * Returns an identifier list with every quads in a format of an array of
   * integers `[s1, p1, o1, g1, s2, p2, o2, g3, ..., sn, pn, on, gn]`
   * where s1 is the subject of the first quad, p1 the predicate of the first
   * quad, ... and gn the graph of the last quad.
   */
  _asIdentifierList(): Uint32Array {
    if (this.identifierList === undefined) {
      if (this.forest === undefined) {
        return Uint32Array.from([]);
      }

      this.identifierList = this.forest.get_all();
    }

    return this.identifierList;
  }

  /**
   * Returns an array with the quads in this dataset
   */
  toArray(): Quad[] {
      return [...this];
  }

  /**
   * Returns true if every quad of the dataset returns true when passed as an
   * argument to quadFilterIteratee
   * @param quadFilterIteratee The function to pass to the quads
   */
  every(quadFilterIteratee: (quad: Quad) => boolean) {
    // FIXME: actually take a QuadFilterIteratee instead of a function
    // We can not do better than a naive implementation with our backend
    for (let quad of this) {
      if (!quadFilterIteratee(quad)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Returns true if at least one quad of the dataset returns true when
   * called on the passed quad
   * @param quadFilterIteratee 
   */
  some(quadFilterIteratee: (quad: Quad) => boolean) {
    // We can not do better than a naive implementation with our backend
    for (let quad of this) {
      if (quadFilterIteratee(quad)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calls the quadRunIteratee function with every quad in the dataset
   */
  forEach(quadRunIteratee: (quad: Quad) => void) {
    // We can not do better than a naive implementation with our backend
    for (let quad of this) {
      quadRunIteratee(quad);
    }
  }

  reduce<T>(
    quadReduceIteratee: (accumulator: T | undefined, quad: Quad) => T,
    initialValue: T
  ): T | undefined;

  reduce<T>(
    quadReduceIteratee: (accumulator: T | Quad | undefined, quad: Quad) => T,
    initialValue?: T
  ): T | Quad | undefined;

  /**
   * Reduce the dataset into a value using the quadReduceIteratee function.
   * And initial value can be provided, else, the value of the first iterated
   * quad will be used
   * @param quadReduceIteratee The reduce function
   * @param initialValue The initial value, if undefined the first quad
   * will be used as an initial value
   */
  reduce<T>(
    quadReduceIteratee: (accumulator: T | Quad | undefined, quad: Quad) => T,
    initialValue?: T | Quad
  ): T | Quad | undefined {
    // We can not do better than a naive implementation with our backend
    let isFirst = true;

    for (let quad of this) {
      if (isFirst) {
        if (initialValue === undefined) {
          initialValue = quad;
        } else {
          initialValue = quadReduceIteratee(initialValue, quad);    
        }

        isFirst = false;
      } else {
        initialValue = quadReduceIteratee(initialValue, quad);
      }
    }

    return initialValue;
  }

  // == DATASET CREATORS FROM FUNCTIONS
  // These functions creates a new dataset after using a function on every
  // quad of this dataset.
  //
  // We have to get every quads from this dataset, and pass them to the
  // function.

  /**
   * Produces a new dataset that is composed of the quad of this dataset that
   * returns true when applied to the passed function
   */
  filter(quadFilterIteratee: (quad: Quad, dataset: DatasetCore) => boolean) {
    let resultingArray = new WasmTreeDatasetIterator(this).filterInUInt32Array(quadFilterIteratee);

    // The resulting array is a valid dataset for our structure, so we do
    // not fall back to wasm backend.
    return WasmTreeDataset._build(this.termIdMap, resultingArray);
  }

  /**
   * Produces a new dataset by applying to the quads the quadMapIteratee
   * function
   */
  map(quadMapIteratee: (quad: Quad, dataset: DatasetCore) => Quad) {
    let resultingArray = new WasmTreeDatasetIterator(this).mapInUInt32Array(quadMapIteratee);
    
    // Return the new dataset:
    // We can not return the dataset with just the resultingArray as it may
    // contain duplicated quads (for example if the map function always
    // returns the same quad). To filter duplicated quad, we integrate the
    // identifier list into a Web Assembly managed forest (which resorts on
    // Rust's BTreeSet).
    // Conveniently, the `_ensureHasModifiableForest` function produces
    // exactly this behaviour.
    let newWasmTreeDataset = WasmTreeDataset._build(this.termIdMap, resultingArray);
    newWasmTreeDataset._ensureHasModifiableForest();
    return newWasmTreeDataset;
  }


  // == ENSEMBLIST OPERATIONS

  static get SIMILARITY_NONE() { return 0; }
  static get SIMILARITY_SAME_CLASS() { return 1; }
  static get SIMILARITY_SAME_TERMIDMAP() { return 2; }

  /**
   * Return :
   * - 0 if the other dataset is not an instance of WasmTreeDataset
   * - 1 if the other dataset is an instance of WasmTreeDataset but does not
   * share its termIdMap object with other
   * - 2 if both this dataset and the other dataset are instances of WasmTreeDataset
   * and share the termIdMap object
   * @param other The other dataset
   */
  _get_degree_of_similarity(other: Iterable<Quad> | any): number {
    if (this._get_degree_of_similarity != other._get_degree_of_similarity) {
      // Different class
      return WasmTreeDataset.SIMILARITY_NONE;
    } else if (this.termIdMap != other.termIdMap) {
      // Different TermIdMap
      return WasmTreeDataset.SIMILARITY_SAME_CLASS;
    } else {
      // Same class and same TermIdMap which means we can rely on pure
      // Rust implementation
      return WasmTreeDataset.SIMILARITY_SAME_TERMIDMAP;
    }
  }

  _operationWithAnotherDataset<I, R>(
    other: DatasetCore,
    functionToCallIfSame: (lhs: this, rhs: WasmTreeDataset) => I,
    functionToCallIfDifferent: (lhs: this, rhs: DatasetCore) => I,
    finalize: (lhs: this, result: I) => R
  ) {
    this._ensureHasForest();

    let similarity = this._get_degree_of_similarity(other);

    if (similarity == WasmTreeDataset.SIMILARITY_SAME_TERMIDMAP) {
      const otherWasmTree: WasmTreeDataset = other as WasmTreeDataset;
      otherWasmTree._ensureHasForest();
      return finalize(this, functionToCallIfSame(this, otherWasmTree));
    } else {
      return finalize(this, functionToCallIfDifferent(this, other));
    }
  }

  /**
   * Returns a dataset which is the intersection of this dataset and the
   * other dataset
   * @param other The dataset to intersect with
   */
  intersection(other: DatasetCore) {
    return this._operationWithAnotherDataset(other,
      (lhs, rhs) => lhs.forest!.insersect(rhs.forest!),
      (lhs, rhs) => {
        const rhsSlice = lhs.termIdMap.buildIdentifierListForIntersection(rhs);
        return lhs.forest!.intersectIdentifierList(rhsSlice);
      },
      (lhs, forest) => WasmTreeDataset._build(lhs.termIdMap, undefined, forest)
    );
  }

  /**
   * Return a new dataset that is the difference between this one and the passed dataset
   * @param other The other dataset
   */
  difference(other: DatasetCore) {
    return this._operationWithAnotherDataset(other,
    (lhs, rhs) => lhs.forest!.difference(rhs.forest!),
      (lhs, rhs) => {
        const rhsSlice = lhs.termIdMap.buildIdentifierListForIntersection(rhs);
        return lhs.forest!.differenceIdentifierList(rhsSlice);
      },
      (lhs, forest) => WasmTreeDataset._build(lhs.termIdMap, undefined, forest)
    );
  }

  /**
   * Returns a new dataset that is the union of this dataset and the other
   * dataset
   * @param other The other dataset
   */
  union(other: DatasetCore) {
    return this._operationWithAnotherDataset(other,
      (lhs, rhs) => lhs.forest!.union(rhs.forest!),
      (lhs, rhs) => {
        const rhsSlice = lhs.termIdMap.buildIdentifierListForUnion(rhs);
        return lhs.forest!.unionIdentifierList(rhsSlice);
      },
      (lhs, forest) => WasmTreeDataset._build(lhs.termIdMap, undefined, forest)
    );
  }
    
  /**
   * Returns true if this dataset contains the other (in other words, if
   * every quad from the other dataset is in this dataset)
   * @param other The contained dataset
   */
  contains(other: DatasetCore) {
    return this._operationWithAnotherDataset(other,
      (lhs, rhs) => lhs.forest!.contains(rhs.forest!),
      (lhs, rhs) => {
        let rhsSlice = lhs.termIdMap.buildIdentifierListForEquality(rhs);
        if (rhsSlice == null) {
          return false;
        } else {
          return lhs.forest!.containsIdentifierList(rhsSlice);
        }
      },
      (_, answer) => answer
    );
  }

  /**
   * Returns true if this and the other dataset are equals.
   * Blank nodes are not normalized, so two datasets are considered equals
   * iif every term have the same identifier
   * 
   * @param other The other dataset
   */
  equals(other: DatasetCore) {
    return this._operationWithAnotherDataset(other,
      (lhs, rhs) => lhs.forest!.has_same_elements(rhs.forest!),
      (lhs, rhs) => {
        let rhsSlice = lhs.termIdMap.buildIdentifierListForEquality(rhs);
        if (rhsSlice == null) {
          return false;
        } else {
          return lhs.forest!.equalsIdentifierList(rhsSlice);
        }
      },
      (_, answer) => answer
    );
  }

  // == ALMOST ENSEMBLIST OPERATION

  /**
   * Adds every quad from the other dataset (or sequence of quads) in this
   * dataset
   * @param other The source sequence of quads or a dataset
   */
  addAll(other: DatasetCore | Quad[]) {
    this._ensureHasModifiableForest();
    let rhsSlice = this.termIdMap.buildIdentifierListForUnion(other);
    this.forest!.insertFromIdentifierList(rhsSlice);

    // Currently commented because forest misses the add_all function
    //this._operationWithAnotherDataset(other,
    //  (lhs, rhs) => lhs.forest!.add_all(rhs.forest!),
    //  (lhs, rhs) => {
    //    // As buildIdentifierListForUnion use the fact that a RDF.JS dataset
    //    // have to implement Iterable<Quad>, a Sequence<Quad> can
    //    // also be passed to buildIdentifierListForUnion.
    //    let rhsSlice = lhs.termIdMap.buildIdentifierListForUnion(rhs);
    //    lhs.forest!.insertFromIdentifierList(rhsSlice);
    //  },
    //  (_1, _2) => { return; }
    //);
  }

  // Promise<Dataset>                  import (Stream stream);
  // Stream                            toStream ();

  // ==== LEFTOVER FUNCTIONS
  // aka why we are not a RDF.JS Dataset

  // String                            toCanonical ();
  // String                            toString ();

  // ==== OTHER FUNCTIONS

  /**
   * Returns the number of quads that will match the given pattern
   * May be used for SPARQL query planning
   * 
   * @param {*} subject Required subject or null 
   * @param {*} predicate Required predicate or null
   * @param {*} object Required object or null
   * @param {*} graph Required graph or null
   */
  countQuads(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null) {
    if (this.forest === undefined && this.identifierList === undefined) return 0;

    this._ensureHasForest();

    let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
    if (matchResult == null) {
      return 0;
    } else {
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

// ============================================================================
// ============================================================================
// ==== Store Implementation

/** Launch an asynchronous function */
function asyncCall(functionToAsync: () => void) {
  // Source : https://stackoverflow.com/a/17361722
  setTimeout(functionToAsync, 0);
}


/**
 * A Stream of Quads with the elements contained in the passed identifier list
 */
class WasmTreeStoreMatch extends Readable {
  list: Uint32Array;
  termIdMap: TermIdMap;
  index: number;

  constructor(termIdMap: TermIdMap, identifierList: Uint32Array) {
    super({ "objectMode": true });
    this.list = identifierList;
    this.termIdMap = termIdMap;
    this.index = 0;
  }

  override _read() {
    if (this.index >= this.list.length) {
      this.push(null);
    } else {
      let identifierQuad: [number, number, number, number] = [
        this.list[this.index],
        this.list[this.index + 1],
        this.list[this.index + 2],
        this.list[this.index + 3]
      ];

      this.index += 4;

      this.push(this.termIdMap.getQuad(identifierQuad));
    }
  }
}

/**
 * A RDF.JS compliant store (http://rdf.js.org/stream-spec/) that resorts to a
 * backend which is a forest structure in Web Assembly and a frontend which is a
 * Javascript map with a correspondance between RDF.JS terms and identifiers
 * (numbers). 
 */
class WasmTreeStore implements Store {
  forest: ForestOfIdentifierQuads | undefined = new ForestOfIdentifierQuads();
  termIdMap: TermIdMap = new TermIdMap();

  /**
   * Builds an empty store
   */
  constructor() {}

  /**
   * Ensures a backend forest is created
   */
  _ensureHasForest() {
    if (this.forest === undefined) {
      this.forest = new ForestOfIdentifierQuads();
    }
  }

  /**
   * Returns a read stream with every quad from this store that matches the
   * given pattern
   * @param subject Required subject or null 
   * @param predicate Required predicate or null
   * @param object Required object or null
   * @param graph Required graph or null
   */
  match(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null) {
    if (this.forest === undefined) {
      return new WasmTreeStoreMatch(this.termIdMap, Uint32Array.from([]));
    }

    let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
    if (matchResult == null) {
      return new WasmTreeStoreMatch(this.termIdMap, Uint32Array.from([]));
    } else {
      let identifierList = this.forest.get_all(
        matchResult[0], matchResult[1], matchResult[2], matchResult[3]
      );
      return new WasmTreeStoreMatch(this.termIdMap, identifierList)
    }
  }

  /**
   * Synchronously returns the number of quads that will match the given pattern
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
      return this.forest.matchCount(
        matchResult[0], matchResult[1], matchResult[2], matchResult[3]
      );
    }
  }

  /**
   * Adds in this store every quad from the given stream of quads.
   * @param streamOfQuads The stream of quads
   */
  import(streamOfQuads: Stream<Quad>): EventEmitter {
    this._ensureHasForest();

    streamOfQuads.on('data', quad => {
      const identifierQuad = this.termIdMap.convertToIdentifierQuad(quad);
      this.forest!.add(...identifierQuad);
    });

    return streamOfQuads;
  }

  /**
   * Removes from this store every quad in the given stream of quads
   * @param streamOfQuads The stream of quads to remove
   */
  remove(streamOfQuads: Stream<Quad>): EventEmitter {
    // TODO : on(data) : Fill a buffer with the quads to delete
    // When the buffer is "fulled" on(data) and "on(end)" : Batch remove
    // from the forest.
    streamOfQuads.on('data', quad => {
      if (this.forest === undefined) return;

      const identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);
      if (identifierQuad !== null) {
        this.forest.remove(...identifierQuad);
      }
    });

    return streamOfQuads;
  }

  /**
   * Removes from this store every quad that matches the given pattern.
   * @param subject The subject or null
   * @param predicate The predicate or null
   * @param object The object or null
   * @param graph The graph or null
   */
  removeMatches(
    subject?: Term | null,
    predicate?: Term | null,
    object?: Term | null,
    graph?: Term | null
  ): EventEmitter {
    let eventEmitter = new EventEmitter();

    let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
    if (matchResult == null) {
      eventEmitter.emit('end');
    } else {        
      asyncCall(() => {
        if (this.forest !== undefined) {
          this.forest.deleteMatches(...matchResult!);
        }
        eventEmitter.emit('end');
      });
    }

    return eventEmitter;
  }

  /**
   * Removes every quad in the given graph
   * @param {*} graph A string or the RDF.JS term corresponding to the graph to remove
   */
  deleteGraph(graph: string | Term): EventEmitter {
    if (typeof graph === 'string') {
      graph = graphyFactory.namedNode(graph);
    }

    return this.removeMatches(null, null, null, graph as Term);
  }

  /**
   * Synchronously liberates the memory assigned to this dataset by the Web
   * Assembly linear memory and empty the store.
   */
  free() {
    if (this.forest !== undefined) {
      this.forest.free();
      this.forest = undefined;
    }
  }

  /**
   * Synchronously add the given quad to the store
   * @param quad The RDF.JS quad to add
   */
  addQuad(quad: Quad) {
    this._ensureHasForest();
    let identifierQuad = this.termIdMap.convertToIdentifierQuad(quad);
    this.forest!.add(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
    return this;
  }

  /**
   * Synchronously add the given quad to the store
   * @param quad The RDF.JS quad to add
   */
  add(quad: Quad) { return this.addQuad(quad); }

  /** Returns the number of trees that are currently used */
  getNumberOfLivingTrees() {
    if (this.forest === undefined) return 0;
    return this.forest.getNumberOfLivingTrees();
  }

  /**
   * If the optimal index to answer the match request for the given pattern is not built,
   * build it. This function is synchrone
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

/**
 * Builds a new WasmTreeStore containing every quad from the stream
 * @param stream The stream containing the quads.
 */
function storeStream(stream: Stream<Quad>) {
  const store = new WasmTreeStore();
  return new Promise<WasmTreeStore>(resolve => store.import(stream).on("end", () => resolve(store)));
}

// Exports

export { WasmTreeDataset as Dataset };
export { WasmTreeStore as Store };

export { AlwaysForestDataset };
export { DatasetWithIdentifierList };
export { DatasetWithSharedTermIdMap };
export { storeStream };
