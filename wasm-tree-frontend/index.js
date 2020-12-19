const graphyFactory = require('@graphy/core.data.factory');
const wasmTreeBackend = require('@bruju/wasm-tree-backend');
const EventEmitter = require('events');
const { Readable } = require('stream');
const { TermIdMap, WasmTreeDatasetIterator } = require('./termidmap.js')
const { DatasetWithIdentifierList, DatasetWithSharedTermIdMap } = require('./alternative.js');

// Use the finalization registry if possible to free the memory by using the
// garbage collector.
const woodcutter = (() => {
    try {
        const r = new FinalizationRegistry(rustforest => rustforest.free());
        return r;
    } catch (err) {
        // FinalizationRegistry is not available
        return undefined;
    }
})();

/**
 * A RDF.JS DatasetCore that resorts on a wasm exported structure that
 * uses several TreeSet and an TermIdMap.
 */
class WasmTreeDataset {
    /**
     * Constructs a WasmTreeDataset
     * 
     * identifierList and forest arguments are used only if a termIdMap is provided
     * @param {*} termIdMap If provided, the TermIdMap to uses
     * @param {*} identifierList If provided, some numbers that represents the quads.
     * @param {*} forest If provided the used forest
     */
    constructor(termIdMap, identifierList, forest) {
        if (termIdMap === undefined) {
            this.termIdMap = new TermIdMap();
            this.forest = new wasmTreeBackend.ForestOfIdentifierQuads();
            this.identifierList = undefined;
        } else {
            this.termIdMap = termIdMap;
            this.forest = forest == null ? undefined : forest;
            this.identifierList = identifierList == null ? undefined : identifierList;
        }

        if (woodcutter && this.forest !== undefined) {
            woodcutter.register(this, this.forest);
        }
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
                this.forest = wasmTreeBackend.ForestOfIdentifierQuads.fromIdentifierList(this.identifierList);
            } else {
                this.forest = new wasmTreeBackend.ForestOfIdentifierQuads();
            }

            if (woodcutter) {
                woodcutter.register(this, this.forest);
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

            if (woodcutter) {
                woodcutter.unregister(this);
            }
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

    /**
     * Adds the quad to the dataset
     * @param {*} quad 
     */
    add(quad) {
        this._ensureHasModifiableForest();

        let identifierQuad = this.termIdMap.convertToIdentifierQuad(quad);
        this.forest.add(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        return this;
    }

    /**
     * Removes the quad from the dataset
     * @param {*} quad 
     */
    delete(quad) {
        let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

        if (identifierQuad !== null) {
            this._ensureHasModifiableForest();
            this.forest.remove(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        }

        return this;
    }

    /**
     * Returns true if the dataset contains the quad
     * @param {*} quad 
     */
    has(quad) {
        let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

        if (identifierQuad === null) {
            return false;
        } else {
            // TODO : Instead of building a forest, we could create a new intermediate state
            // where the backend owns an identifierList but has not yet built any tree.
            this._ensureHasForest();
            return this.forest.has(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        }
    }

    /**
     * Returns a new dataset with the specified subject, predicate, object and
     * graph, if provided
     * @param {*} subject The subject or null
     * @param {*} predicate The predicate or null
     * @param {*} object The object or null
     * @param {*} graph The graph or null
     */
    match(subject, predicate, object, graph) {
        // Rewrite match parameters with identifiers
        let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
        if (matchResult === null) {
            return new WasmTreeDataset(this.termIdMap);
        }

        // Match is valid
        this._ensureHasForest();
        let identifierList = this.forest.get_all(
            matchResult[0], matchResult[1], matchResult[2], matchResult[3]
        );
        return new WasmTreeDataset(this.termIdMap, identifierList);
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
     * @param {?Term} subject The subject of the quads to remove, or null / undefined
     * @param {?Term} predicate The predicate of the quads to remove, or null / undefined
     * @param {?Term} object The object of the quads to remove, or null / undefined
     * @param {?Term} graph The graph of the quads to remove, or null / undefined
     */
    deleteMatches(subject, predicate, object, graph) {
        let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
        if (matchResult === null) {
            return this;
        }

        this._ensureHasModifiableForest();
        this.forest.deleteMatches(matchResult[0], matchResult[1], matchResult[2], matchResult[3]);
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
    _asIdentifierList() {
        if (this.identifierList === undefined) {
            if (this.forest === undefined) {
                return [];
            }

            this.identifierList = this.forest.get_all(null, null, null, null);
        }

        return this.identifierList;
    }

    /**
     * Returns an array with the quads in this dataset
     */
    toArray() {
        return Array.from(this[Symbol.iterator]);
    }

    /**
     * Returns true if every quad of the dataset returns true when passed as an
     * argument to quadFilterIteratee
     * @param {*} quadFilterIteratee The function to pass to the quads
     */
    every(quadFilterIteratee) {
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
     * @param {*} quadFilterIteratee 
     */
    some(quadFilterIteratee) {
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
     * @param {*} quadRunIteratee 
     */
    forEach(quadRunIteratee) {
        // We can not do better than a naive implementation with our backend
        for (let quad of this) {
            quadRunIteratee(quad);
        }
    }

    /**
     * Reduce the dataset into a value using the quadReduceIteratee function.
     * And initial value can be provided, else, the value of the first iterated
     * quad will be used
     * @param {*} quadReduceIteratee The reduce function
     * @param {?any} initialValue The initial value, if undefined the first quad
     * will be used as an initial value
     */
    reduce(quadReduceIteratee, initialValue) {
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
     * @param {*} quadFilterIteratee The function
     */
    filter(quadFilterIteratee) {
        let resultingArray = new WasmTreeDatasetIterator(this).filterInUInt32Array(quadFilterIteratee);

        // The resulting array is a valid dataset for our structure, so we do
        // not fall back to wasm backend.
        return new WasmTreeDataset(this.termIdMap, resultingArray);
    }

    /**
     * Produces a new dataset by applying to the quads the quadMapIteratee
     * function
     * @param {*} quadMapIteratee 
     */
    map(quadMapIteratee) {
        let resultingArray = new WasmTreeDatasetIterator(this).mapInUInt32Array(quadMapIteratee);
        
        // Return the new dataset:
        // We can not return the dataset with just the resultingArray as it may
        // contain duplicated quads (for example if the map function always
        // returns the same quad). To filter duplicated quad, we integrate the
        // identifier list into a Web Assembly managed forest (which resorts on
        // Rust's BTreeSet).
        // Conveniently, the `_ensureHasModifiableForest` function produces
        // exactly this behaviour.
        let newWasmTreeDataset = new WasmTreeDataset(this.termIdMap, resultingArray);
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
     * @param {*} other The other dataset
     */
    _get_degree_of_similarity(other) {
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

    _operationWithAnotherDataset(other, functionToCallIfSame, functionToCallIfDifferent, finalize) {
        this._ensureHasForest();

        let similarity = this._get_degree_of_similarity(other);

        if (similarity == WasmTreeDataset.SIMILARITY_SAME_TERMIDMAP) {
            other._ensureHasForest();
            return finalize(this, functionToCallIfSame(this, other));
        } else {
            return finalize(this, functionToCallIfDifferent(this, other));
        }
    }

    /**
     * Returns a dataset which is the intersection of this dataset and the
     * other dataset
     * @param {DatasetCore} other The dataset to intersect with
     */
    intersection(other) {
        return this._operationWithAnotherDataset(other,
            (lhs, rhs) => lhs.forest.insersect(rhs.forest),
            (lhs, rhs) => {
                let rhsSlice = lhs.termIdMap.buildIdentifierListForIntersection(rhs);
                return lhs.forest.intersectIdentifierList(rhsSlice);
            },
            (lhs, forest) => new WasmTreeDataset(lhs.termIdMap, undefined, forest)
        );
    }

    /**
     * Return a new dataset that is the difference between this one and the passed dataset
     * @param {*} other The other dataset
     */
    difference(other) {
        return this._operationWithAnotherDataset(other,
            (lhs, rhs) => lhs.forest.difference(rhs.forest),
            (lhs, rhs) => {
                let rhsSlice = lhs.termIdMap.buildIdentifierListForIntersection(rhs);
                return lhs.forest.differenceIdentifierList(rhsSlice);
            },
            (lhs, forest) => new WasmTreeDataset(lhs.termIdMap, undefined, forest)
        );
    }

    /**
     * Returns a new dataset that is the union of this dataset and the other
     * dataset
     * @param {*} other The other dataset
     */
    union(other) {
        return this._operationWithAnotherDataset(other,
            (lhs, rhs) => lhs.forest.union(rhs.forest),
            (lhs, rhs) => {
                let rhsSlice = lhs.termIdMap.buildIdentifierListForUnion(rhs);
                return lhs.forest.unionIdentifierList(rhsSlice);
            },
            (lhs, forest) => new WasmTreeDataset(lhs.termIdMap, undefined, forest)
        );
    }
    
    /**
     * Returns true if this dataset contains the other (in other words, if
     * every quad from the other dataset is in this dataset)
     * @param {*} other The contained dataset
     */
    contains(other) {
        return this._operationWithAnotherDataset(other,
            (lhs, rhs) => lhs.forest.contains(rhs.forest),
            (lhs, rhs) => {
                let rhsSlice = lhs.termIdMap.buildIdentifierListForEquality(rhs);
                if (rhsSlice == null) {
                    return false;
                } else {
                    return lhs.forest.containsIdentifierList(rhsSlice);
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
     * @param {*} other The other dataset
     */
    equals(other) {
        return this._operationWithAnotherDataset(other,
            (lhs, rhs) => lhs.forest.has_same_elements(rhs.forest),
            (lhs, rhs) => {
                let rhsSlice = lhs.termIdMap.buildIdentifierListForEquality(rhs);
                if (rhsSlice == null) {
                    return false;
                } else {
                    return lhs.forest.equalsIdentifierList(rhsSlice);
                }
            },
            (_, answer) => answer
        );
    }

    // == ALMOST ENSEMBLIST OPERATION

    /**
     * Adds every quad from the other dataset (or sequence of quads) in this
     * dataset
     * @param {*} other The source sequence of quads or a dataset
     */
    addAll(other) {
        this._operationWithAnotherDataset(other,
            (lhs, rhs) => lhs.forest.addAll(rhs.forest),
            (lhs, rhs) => {
                // As buildIdentifierListForUnion use the fact that a RDF.JS dataset
                // have to implement Iterable<Quad>, a Sequence<Quad> can
                // also be passed to buildIdentifierListForUnion.
                let rhsSlice = lhs.termIdMap.buildIdentifierListForUnion(rhs);
                lhs.forest.insertFromIdentifierList(rhsSlice);
            },
            (_1, _2) => { return; }
        );
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
    countQuads(subject, predicate, object, graph) {
        if (this.forest === undefined && this.identifierList === undefined) return 0;

        this._ensureHasForest();

        let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
        if (matchResult == null) {
            return 0;
        } else {
            return this.forest.matchCount(matchResult[0], matchResult[1], matchResult[2], matchResult[3]);
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
     * @param {Boolean} subject 
     * @param {Boolean} predicate 
     * @param {Boolean} object 
     * @param {Boolean} graph 
     */
    ensureHasIndexFor(subject, predicate, object, graph) {
        this._ensureHasForest();
        this.forest.ensureHasIndexfor(!!subject, !!predicate, !!object, !!graph);
    }
}

/**
 * A RDF.JS DatasetCore that resorts on a wasm exported structure
 * to manage its quads.
 * 
 * Unlike WasmTreeDataset, this class doesn't use any cache process
 * (identifierList) and doesn't share its termIdMap with other instances.
 * 
 * In general case, WasmTreeDataset should be prefered to this class.
 */
class AlwaysForestDataset {
    /**
     * Constructs a AlwaysForestDataset
     * 
     * identifierList and forest arguments are used only if a termIdMap is provided
     * @param {*} termIdMap If provided, the TermIdMap to duplicate
     * @param {*} identifierList If provided, some numbers that represents the quads.
     */
    constructor(termIdMap, identifierList) {
        if (identifierList != undefined) {
            this.forest = wasmTreeBackend.ForestOfIdentifierQuads.fromIdentifierList(identifierList);
            this.termIdMap = TermIdMap.duplicate(termIdMap, identifierList);
        } else {
            this.forest = new wasmTreeBackend.ForestOfIdentifierQuads();
            this.termIdMap = new TermIdMap();
        }

        if (woodcutter) {
            woodcutter.register(this, this.forest);
        }
    }

    /**
     * Ensure a forest is instanciated.
     * 
     * It is usefull if the user frees an instance and then reuse it.
     */
    _ensureHasForest() {
        if (this.forest === undefined) {
            this.forest = new wasmTreeBackend.ForestOfIdentifierQuads();
            
            if (woodcutter) {
                woodcutter.register(this, this.forest);
            }
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

            if (woodcutter) {
                woodcutter.unregister(this);
            }
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

    /**
     * Adds the quad to the dataset
     * @param {*} quad 
     */
    add(quad) {
        this._ensureHasForest();

        let identifierQuad = this.termIdMap.convertToIdentifierQuad(quad);
        this.forest.add(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        return this;
    }

    /**
     * Removes the quad from the dataset
     * @param {*} quad 
     */
    delete(quad) {
        let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

        if (identifierQuad !== null) {
            this._ensureHasForest();
            this.forest.remove(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        }

        return this;
    }

    /**
     * Returns true if the dataset contains the quad
     * @param {*} quad 
     */
    has(quad) {
        let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

        if (identifierQuad === null) {
            return false;
        } else {
            this._ensureHasForest();
            return this.forest.has(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        }
    }

    /**
     * Returns a new dataset with the specified subject, predicate, object and
     * graph, if provided
     * @param {*} subject The subject or null
     * @param {*} predicate The predicate or null
     * @param {*} object The object or null
     * @param {*} graph The graph or null
     */
    match(subject, predicate, object, graph) {
        // Rewrite match parameters with identifiers
        let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
        if (matchResult === null) {
            return new AlwaysForestDataset(this.termIdMap);
        }

        // Match is valid
        this._ensureHasForest();
        let identifierList = this.forest.get_all(
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
    _asIdentifierList() {
        if (this.forest === undefined) {
            return [];
        } else {
            return this.forest.get_all(null, null, null, null);
        }
    }

    /**
     * Returns an array with the quads in this dataset
     */
    toArray() {
        return Array.from(this[Symbol.iterator]);
    }

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
    countQuads(subject, predicate, object, graph) {
        if (this.forest === undefined && this.identifierList === undefined) return 0;

        this._ensureHasForest();

        let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
        if (matchResult == null) {
            return 0;
        } else {
            return this.forest.matchCount(matchResult[0], matchResult[1], matchResult[2], matchResult[3]);
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
     * @param {Boolean} subject 
     * @param {Boolean} predicate 
     * @param {Boolean} object 
     * @param {Boolean} graph 
     */
    ensureHasIndexFor(subject, predicate, object, graph) {
        this._ensureHasForest();
        this.forest.ensureHasIndexfor(!!subject, !!predicate, !!object, !!graph);
    }
}

// ============================================================================
// ============================================================================
// ==== Store Implementation

/** Launch an asynchronous function */
function asyncCall(functionToAsync) {
    // Source : https://stackoverflow.com/a/17361722
    setTimeout(functionToAsync, 0);
}


/**
 * A Stream of Quads with the elements contained in the passed identifier list
 */
class WasmTreeStoreMatch extends Readable {
    constructor(termIdMap, identifierList) {
        super({ "objectMode": true });
        this.list = identifierList;
        this.termIdMap = termIdMap;
        this.index = 0;
    }

    _read() {
        if (this.index >= this.list.length) {
            this.push(null);
        } else {
            let identifierQuad = [
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
class WasmTreeStore {
    /**
     * Builds an empty store
     */
    constructor() {
        this.forest = new wasmTreeBackend.ForestOfIdentifierQuads();
        this.termIdMap = new TermIdMap();

        if (woodcutter) {
            woodcutter.register(this, this.forest);
        }
    }

    /**
     * Ensures a backend forest is created
     */
    _ensureHasForest() {
        if (this.forest === null) {
            this.forest = new wasmTreeBackend.ForestOfIdentifierQuads();

            if (woodcutter) {
                woodcutter.register(this, this.forest);
            }
        }
    }

    /**
     * Returns a read stream with every quad from this store that matches the
     * given pattern
     * @param {*} subject Required subject or null 
     * @param {*} predicate Required predicate or null
     * @param {*} object Required object or null
     * @param {*} graph Required graph or null
     */
    match(subject, predicate, object, graph) {
        if (this.forest === null) return new WasmTreeStoreMatch(this.termIdMap, []);

        let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
        if (matchResult == null) {
            return new WasmTreeStoreMatch(this.termIdMap, []);
        } else {
            let identifierList = this.forest.get_all(
                matchResult[0], matchResult[1], matchResult[2], matchResult[3]
            );
            return new WasmTreeStoreMatch(this.termIdMap, identifierList)
        }
    }

    /**
     * Synchronously returns the number of quads that will match the given pattern
     * @param {*} subject Required subject or null 
     * @param {*} predicate Required predicate or null
     * @param {*} object Required object or null
     * @param {*} graph Required graph or null
     */
    countQuads(subject, predicate, object, graph) {
        if (this.forest === null) return 0;

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
     * @param {*} streamOfQuads The stream of quads
     */
    import(streamOfQuads) {
        this._ensureHasForest();
        let that = this;

        streamOfQuads.on('data', quad => {
            let identifierQuad = that.termIdMap.convertToIdentifierQuad(quad);
            that.forest.add(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        });

        return streamOfQuads;
    }

    /**
     * Removes from this store every quad in the given stream of quads
     * @param {*} streamOfQuads The stream of quads to remove
     */
    remove(streamOfQuads) {
        // TODO : on(data) : Fill a buffer with the quads to delete
        // When the buffer is "fulled" on(data) and "on(end)" : Batch remove
        // from the forest.
        let that = this;

        streamOfQuads.on('data', quad => {
            if (that.forest === null) return;

            let identifierQuad = that.termIdMap.tryConvertToIdentifierQuad(quad);

            if (identifierQuad !== null) {
                that.forest.remove(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
            }
        });

        return streamOfQuads;
    }

    /**
     * Removes from this store every quad that matches the given pattern.
     * @param {*} subject The subject or null
     * @param {*} predicate The predicate or null
     * @param {*} object The object or null
     * @param {*} graph The graph or null
     */
    removeMatches(subject, predicate, object, graph) {
        let eventEmitter = new EventEmitter();

        let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
        if (matchResult == null) {
            eventEmitter.emit('end');
        } else {
            let that = this;
            
            asyncCall(() => {
                if (that.forest !== null) {
                    that.forest.deleteMatches(
                        matchResult[0], matchResult[1], matchResult[2], matchResult[3]
                    );
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
    deleteGraph(graph) {
        if (Object.prototype.toString.call(graph) === "[object String]") {
            // TODO : we could directly concise the graph name instead of using an intermediate NamedNode
            graph = graphyFactory.namedNode(graph);
        }

        return this.removeMatches(null, null, null, graph);
    }

    /**
     * Synchronously liberates the memory assigned to this dataset by the Web
     * Assembly linear memory and empty the store.
     */
    free() {
        if (this.forest !== null) {
            this.forest.free();
            this.forest = null;

            if (woodcutter) {
                woodcutter.unregister(this);
            }
        }
    }

    /**
     * Synchronously add the given quad to the store
     * @param {*} quad The RDF.JS quad to add
     */
    addQuad(quad) {
        this._ensureHasForest();
        let identifierQuad = this.termIdMap.convertToIdentifierQuad(quad);
        this.forest.add(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        return this;
    }

    /**
     * Synchronously add the given quad to the store
     * @param {*} quad The RDF.JS quad to add
     */
    add(quad) {
        return this.addQuad(quad);
    }

    /** Returns the number of trees that are currently used */
    getNumberOfLivingTrees() {
        if (this.forest === null)
            return 0;
        return this.forest.getNumberOfLivingTrees();
    }

    /**
     * If the optimal index to answer the match request for the given pattern is not built,
     * build it. This function is synchrone
     * @param {Boolean} subject 
     * @param {Boolean} predicate 
     * @param {Boolean} object 
     * @param {Boolean} graph 
     */
    ensureHasIndexFor(subject, predicate, object, graph) {
        this._ensureHasForest();
        this.forest.ensureHasIndexfor(subject, predicate, object, graph);
    }
}

/**
 * Builds a new WasmTreeStore containing every quad from the stream
 * @param {RDF.Stream} stream The stream containing the quads.
 */
function storeStream(stream) {
    const store = new WasmTreeStore();
    return new Promise(resolve => store.import(stream).on("end", () => resolve(store)));
}

// Exports

module.exports = {};

module.exports.Dataset = WasmTreeDataset;
module.exports.Store = WasmTreeStore;

module.exports.AlwaysForestDataset = AlwaysForestDataset;
module.exports.DatasetWithIdentifierList = DatasetWithIdentifierList;
module.exports.DatasetWithSharedTermIdMap = DatasetWithSharedTermIdMap;

module.exports.storeStream = storeStream;
