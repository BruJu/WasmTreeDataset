let graphyFactory = require('@graphy/core.data.factory');
const rust = require('@bruju/wasm-tree-backend');
const EventEmitter = require('events');
const { Readable } = require('stream');

// TODO : convert every_snake_case_name into camelCase

/**
 * Returns true if expr is undefined or null
 * @param {*} expr 
 */
function isLikeNone(expr) {
    return expr === undefined || expr === null;
}


let registry = undefined;
try {
    registry = new FinalizationRegistry(rusttree => rusttree.free());
} catch (err) {
    // FinalizationRegistry is not available
    registry = undefined;
}

/**
 * A class that maps terms with numbers.
 * The mapping resorts to Graphy's concise terms and Javascript maps.
 * 
 * Mapped terms are never destroyed from the map
 */
class Indexer {
    /**
     * Constructs an indexer with the default graph as the 0th term
     */
    constructor() {
        this.indexToTerms = [graphyFactory.defaultGraph()];
        this.termsToIndex = {};
        this.termsToIndex[graphyFactory.defaultGraph().concise()] = 0;
        this.nextValue = 1;
    }

    /**
     * Returns the graphy term bound to this index
     * @param {number} index The index
     */
    getTerm(index) {
        return this.indexToTerms[index];
    }

    /**
     * Returns the index of the given term, or 0 if not mapped
     * @param {Object} term The term
     */
    findIndex(term) {
        let graphyTerm = graphyFactory.fromTerm(term);
        let concise = graphyTerm.concise();
        return this.termsToIndex[concise];
    }

    /**
     * Returns the index of the given term. If not present, it will be added in
     * the indexer.
     * @param {Object} term The term
     */
    findOrAddIndex(term) {
        let graphyTerm = graphyFactory.fromTerm(term);
        let concise = graphyTerm.concise();
        let r = this.termsToIndex[concise];
        if (r !== undefined) {
            return r;
        } else {
            let index = this.nextValue;
            this.termsToIndex[concise] = index;
            this.indexToTerms.push(graphyTerm);
            this.nextValue += 1;
            return index;
        }
    }

    /**
     * Returns an array of four indexes, corresponding to the terms from the
     * quad. If a term is not known yet, a new index will be created
     * @param {Object} quad A RDF.JS compliant quad
     */
    findOrAddIndexes(quad) {
        return [
            this.findOrAddIndex(quad.subject),
            this.findOrAddIndex(quad.predicate),
            this.findOrAddIndex(quad.object),
            this.findOrAddIndex(quad.graph)
        ];
    }

    /**
     * Returns an array of four indexes, corresponding to the terms from the
     * quad. If a term is not known yet, null will be returned
     * @param {Object} quad A RDF.JS compliant quad
     */
    findIndexes(quad) {
        let quadIndexes = [
            this.findIndex(quad.subject),
            this.findIndex(quad.predicate),
            this.findIndex(quad.object),
            this.findIndex(quad.graph)
        ];

        for (let i = 0 ; i != 4 ; i++) {
            if (quadIndexes[i] === undefined) {
                return null;
            }
        }

        return quadIndexes;
    }

    /**
     * Returns a RDF.JS quad if the passed indexes exist, null if one of them
     * does not
     * @param {*} spog An array of four indexes. Its content is altered by
     * this function.
     */
    getQuad(spog) {
        for (let i = 0 ; i != 4 ; ++i) {
            spog[i] = this.getTerm(spog[i]);
            if (spog[i] === undefined) return null;
        }

        return graphyFactory.quad(spog[0], spog[1], spog[2], spog[3]);
    }

    /**
     * Write in the array at position [startingPosition:startingPosition+4] the
     * index of the subject, the predicate, the object and the graph of the
     * given quad.
     * 
     * This function has been created to be able to store indexes without creating
     * a temporary array like the findOrAddIndexes method
     * @param {*} array An array (or an array like structure) in which the
     * indexes will be written
     * @param {Number} startingPosition Position where the subject index will be
     * written
     * @param {*} quad The RDF.JS compliant quad
     */
    writeTermIndexesIn(array, startingPosition, quad) {
        array[startingPosition + 0] = this.findOrAddIndex(quad.subject)
        array[startingPosition + 1] = this.findOrAddIndex(quad.predicate)
        array[startingPosition + 2] = this.findOrAddIndex(quad.object)
        array[startingPosition + 3] = this.findOrAddIndex(quad.graph)
    }

    /**
     * Push the index of quad terms in the given array
     * @param {*} array The array to fill
     * @param {*} quad The RDF.JS quad to insert in the list of term indexes
     */
    pushTermIndexesIn(array, quad) {
        array.push(this.findOrAddIndex(quad.subject));
        array.push(this.findOrAddIndex(quad.predicate));
        array.push(this.findOrAddIndex(quad.object));
        array.push(this.findOrAddIndex(quad.graph));
    }

    /**
     * Build an array that is suitable to pass to a wasm tree that uses
     * the indexes described by this indexer for the intersection function (or
     * any function that results in a dataset that will contains some of the
     * quad of the original dataset and no extra quad)
     * @param {*} dataset The other dataset
     */
    buildSliceForIntersection(dataset) {
        let array = [];

        for (let quad of dataset) {
            let indexes = this.findIndexes(quad);
            if (indexes != null) {
                array.push(...indexes);
            }
        }

        return array;
    }

    /**
     * Build an array that is suitable to pass to a wasm tree that uses
     * the indexes described by this indexer for the union function (or
     * any function that results in a dataset that will contains quads
     * frorm the current and/or the other dataset)
     * @param {*} dataset The other dataset
     */
    buildSliceForUnion(dataset) {
        const length = dataset.length;
        if (isLikeNone(length)) {
            // We do not know in advance the length of the dataset. Only use the iterator
            let array = [];

            for (let quad of dataset) {
                this.pushTermIndexesIn(array, quad);
            }

            return array;
        } else {
            let array = new Array(dataset.length * 4);

            let i = 0;
            for (let quad of dataset) {
                this.writeTermIndexesIn(array, i, quad);
                i += 4;
            }

            return array;
        }
    }

    /**
     * Builds a list of terms represented by their index from a list of RDF.JS
     * quads. If a term has no known index, null is returned instead.
     * @param {*} dataset A list of RDF.JS quads
     */
    buildSliceForEquals(dataset) {
        let array = [];

        for (let quad of dataset) {
            let indexes = this.findIndexes(quad);
            if (indexes != null) {
                array.push(...indexes);
            } else {
                return null;
            }
        }

        return array;
    }

    /**
     * Transforms the subject, predicate, object and graph received as Terms
     * into indexes. If a matching could not be done, returns null. Else,
     * returns an array with the indexes or null/undefined when the term was
     * already null or undefined.
     * 
     * @param {?Term} subject 
     * @param {?Term} predicate 
     * @param {?Term} object 
     * @param {?Term} graph 
     */
    _matchIndexes(subject, predicate, object, graph) {
        if (!isLikeNone(subject)) {
            subject = this.findIndex(subject);
            if (isLikeNone(subject)) return null;
        }

        if (!isLikeNone(predicate)) {
            predicate = this.findIndex(predicate);
            if (isLikeNone(predicate)) return null;
        }

        if (!isLikeNone(object)) {
            object = this.findIndex(object);
            if (isLikeNone(object)) return null;
        }

        if (!isLikeNone(graph)) {
            graph = this.findIndex(graph);
            if (isLikeNone(graph)) return null;
        }

        return [subject, predicate, object, graph]
    }
}

/** An iterator on a Wrapped Tree */
class WrappedTreeIterator {
    constructor(wrappedTree) {
        this.index = 0;
        this.data = wrappedTree._get_slice();
        this.indexer = wrappedTree.indexer;
        this.wrappedTree = wrappedTree;
    }

    next() {
        if (this.index >= this.data.length) {
            return { value: null, done: true };
        } else {
            let spogIndexes = [
                this.data[this.index],
                this.data[this.index + 1],
                this.data[this.index + 2],
                this.data[this.index + 3]
            ];
            
            let value = this.indexer.getQuad(spogIndexes);
            this.index += 4;

            return { value: value, done: false };
        }
    }

    filterInUInt32Array(quadFilterIteratee) {
        const resultArrayLength = this.data.length - this.index;
        let resultingArray = new Uint32Array(resultArrayLength);

        // Filtering process
        let i = 0;
        while (true) {
            let it = this.next();
            if (it.done) {
                break;
            }

            if (quadFilterIteratee(it.value, this.wrappedTree)) {
                // We could do a look up of the terms from it.value, but can
                // just look back the term indexes
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
     * Builds a Uint32Array which contains the list of term indexes of the quad
     * obtained by applying to them the quadMapIteratee function.
     * 
     * The returned Uint32Array may contain duplicated quads depending on the
     * quadMapIteratee function.
     */
    mapInUInt32Array(quadMapIteratee) {
        let resultingArray = new Uint32Array(this.data.length - this.index);

        let i = 0;
        while (true) {
            let it = this.next();
            if (it.done) {
                break;
            }

            let mappedQuad = quadMapIteratee(it.value, this.wrappedTree);
            this.indexer.writeTermIndexesIn(resultingArray, i, mappedQuad);
            i += 4;
        }

        return resultingArray;
    }
}

/**
 * A RDF.JS DatasetCore that resorts on a wasm exported structure that
 * uses several TreeSet and an Indexer.
 */
class TreeDataset {
    /**
     * Constructs a Wrapped Tree
     * 
     * slice and tree arguments are used only if an indexer is provided
     * @param {*} indexer If provided, the indexer to uses
     * @param {*} slice If provided, some numbers that represents the quads.
     * @param {*} tree If provided the used tree
     */
    constructor(indexer, slice, tree) {
        if (indexer === undefined) {
            this.indexer = new Indexer();
            this.tree = new rust.TreedDataset();
            this.slice = undefined;
        } else {
            this.indexer = indexer;
            this.tree = tree;
            this.slice = slice === null ? undefined : slice;
        }

        if (registry && this.tree !== undefined) {
            registry.register(this, this.tree);
        }
    }

    /** Falls back to the tree structure if a slice is owned */
    _ensure_has_tree() {
        if (this.tree === undefined) {
            if (this.slice !== undefined) {
                this.tree = rust.TreedDataset.new_from_slice(this.slice);
            } else {
                this.tree = new rust.TreedDataset();
            }

            if (registry) {
                registry.register(this, this.tree);
            }
        }
    }

    /** Ensures a tree is owned and no slice is owned */
    _ensure_has_modifiable_tree() {
        this._ensure_has_tree();
        this.slice = undefined;
    }

    /**
     * Liberates the memory allocated by wasm for the tree and empties the tree
     */
    free() {
        if (this.tree !== undefined) {
            this.tree.free();
            this.tree = undefined;

            if (registry) {
                registry.unregister(this);
            }
        }

        this.slice = undefined;
    }

    // ========================================================================
    // ==== RDF.JS DatasetCore Implementation
    // ==== https://rdf.js.org/dataset-spec/#datasetcore-interface

    /**
     * Returns the number of contained elements.
     */
    get size() {
        if (this.slice !== undefined) {
            return this.slice.length / 4;
        } else if (this.tree !== undefined) {
            return this.tree.size();
        } else {
            return 0;
        }
    }

    [Symbol.iterator]() {
        return new WrappedTreeIterator(this);
    }

    /**
     * Adds the quad to the dataset
     * @param {*} quad 
     */
    add(quad) {
        this._ensure_has_modifiable_tree();

        let quadIndexes = this.indexer.findOrAddIndexes(quad);
        this.tree.add(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        return this;
    }

    /**
     * Removes the quad from the dataset
     * @param {*} quad 
     */
    delete(quad) {
        let quadIndexes = this.indexer.findIndexes(quad);

        if (quadIndexes !== null) {
            this._ensure_has_modifiable_tree();
            this.tree.remove(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        }

        return this;
    }

    /**
     * Returns true if the dataset contains the quad
     * @param {*} quad 
     */
    has(quad) {
        let quadIndexes = this.indexer.findIndexes(quad);

        if (quadIndexes === null) {
            return false;
        } else {
            // TODO : if we have a slice, we could try to ask to rust to find the quad (but beware of copy)
            // Note : Even if a copy is done, we could create another state which is "Rust owns a copy"
            this._ensure_has_tree();
            return this.tree.has(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
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
        // Rewrite match parameters with indexes
        let matchResult = this.indexer._matchIndexes(subject, predicate, object, graph);
        if (matchResult === null) {
            return new TreeDataset(this.indexer);
        }

        // Match is valid
        this._ensure_has_tree();
        let slice = this.tree.get_all(matchResult[0], matchResult[1], matchResult[2], matchResult[3]);
        return new TreeDataset(this.indexer, slice);
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
        let matchResult = this.indexer._matchIndexes(subject, predicate, object, graph);
        if (matchResult === null) {
            return this;
        }

        this._ensure_has_modifiable_tree();
        this.tree.deleteMatches(matchResult[0], matchResult[1], matchResult[2], matchResult[3]);
        return this;
    }
    
    // == SLICE EXPLOITATION
    // Theses functions requires Web Assembly to return the whole array of
    // indexes and do all the operation in Javascript.
    //
    // They are implemented with the naive way because they heavily resorts on
    // Javascript closures

    /**
     * Returns a slice with every quads in a format of an array of integers with
     * `[s1, p1, o1, g1, s2, p2, o2, g3, ..., sn, pn, on, gn]`
     * where s1 is the subject of the first quad, p1 the predicate of the first
     * quad, ... and gn the graph of the last quad.
     */
    _get_slice() {
        if (this.slice === undefined) {
            if (this.tree === undefined) {
                return [];
            } else {
                return this.tree.get_all(null, null, null, null);
            }
        } else {
            return this.slice;
        }
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
        let resultingArray = new WrappedTreeIterator(this).filterInUInt32Array(quadFilterIteratee);

        // The resulting array is a valid dataset for our structure, so we do
        // not fall back to wasm backend.
        return new TreeDataset(this.indexer, resultingArray);
    }

    /**
     * Produces a new dataset by applying to the quads the quadMapIteratee
     * function
     * @param {*} quadMapIteratee 
     */
    map(quadMapIteratee) {
        let resultingArray = new WrappedTreeIterator(this).mapInUInt32Array(quadMapIteratee);
        
        // Return the new tree :
        // We can not return the tree with just the resultingArray as it may
        // contain duplicated quads (for example if the map function always
        // returns the same quad). To filter duplicated quad, we integrate the
        // slice into a Wasm managed tree (which resorts on Rust's BTreeSet)
        // Conveniently, the `_ensure_has_modifiable_tree` function produces
        // exactly this behaviour.
        let newWrappedTree = new TreeDataset(this.indexer, resultingArray);
        newWrappedTree._ensure_has_modifiable_tree();
        return newWrappedTree;
    }


    // == ENSEMBLIST OPERATIONS

    static get SIMILARITY_NONE() { return 0; }
    static get SIMILARITY_SAME_CLASS() { return 1; }
    static get SIMILARITY_SAME_INDEXER() { return 2; }

    /**
     * Return :
     * - 0 if the other dataset is not an instance of TreeDataset
     * - 1 if the other dataset is an instance of TreeDataset but does not
     * share its indexer object with other
     * - 2 if both this dataset and the other dataset are instances of Wrapped
     * Tree and share the indexer object
     * @param {*} other The other dataset
     */
    _get_degree_of_similarity(other) {
        if (this._are_both_wrapped_trees != other._are_both_wrapped_trees) {
            // Different class
            return TreeDataset.SIMILARITY_NONE;
        } else if (this.indexer != other.indexer) {
            // Different indexer
            return TreeDataset.SIMILARITY_SAME_CLASS;
        } else {
            // Same class and same indexer which means we can rely on a pure Rust implementation
            return TreeDataset.SIMILARITY_SAME_INDEXER;
        }
    }

    _operationWithAnotherDataset(other, functionToCallIfSame, functionToCallIfDifferent, finalize) {
        this._ensure_has_tree();

        let similarity = this._get_degree_of_similarity(other);

        if (similarity == TreeDataset.SIMILARITY_SAME_INDEXER) {
            other._ensure_has_tree();
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
            (lhs, rhs) => lhs.tree.insersect(rhs.tree),
            (lhs, rhs) => {
                let rhsSlice = lhs.indexer.buildSliceForIntersection(rhs);
                return lhs.tree.intersectSlice(rhsSlice);
            },
            (lhs, tree) => new TreeDataset(lhs.indexer, undefined, tree)
        );
    }

    /**
     * Return a new dataset that is the difference between this one and the passed dataset
     * @param {*} other The other dataset
     */
    difference(other) {
        return this._operationWithAnotherDataset(other,
            (lhs, rhs) => lhs.tree.difference(rhs.tree),
            (lhs, rhs) => {
                let rhsSlice = lhs.indexer.buildSliceForIntersection(rhs);
                return lhs.tree.differenceSlice(rhsSlice);
            },
            (lhs, tree) => new TreeDataset(lhs.indexer, undefined, tree)
        );
    }

    /**
     * Returns a new dataset that is the union of this dataset and the other
     * dataset
     * @param {*} other The other dataset
     */
    union(other) {
        return this._operationWithAnotherDataset(other,
            (lhs, rhs) => lhs.tree.union(rhs.tree),
            (lhs, rhs) => {
                let rhsSlice = lhs.indexer.buildSliceForUnion(rhs);
                return lhs.tree.unionSlice(rhsSlice);
            },
            (lhs, tree) => new TreeDataset(lhs.indexer, undefined, tree)
        );
    }
    
    /**
     * Returns true if this dataset contains the other (in other words, if
     * every quad from the other dataset is in this dataset)
     * @param {*} other The contained dataset
     */
    contains(other) {
        return this._operationWithAnotherDataset(other,
            (lhs, rhs) => lhs.tree.contains(rhs.tree),
            (lhs, rhs) => {
                let rhsSlice = lhs.indexer.buildSliceForEquals(rhs);
                if (rhsSlice == null) {
                    return false;
                } else {
                    return lhs.tree.containsSlice(rhsSlice);
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
            (lhs, rhs) => lhs.tree.has_same_elements(rhs.tree),
            (lhs, rhs) => {
                let rhsSlice = lhs.indexer.buildSliceForEquals(rhs);
                if (rhsSlice == null) {
                    return false;
                } else {
                    return lhs.tree.equalsSlice(rhsSlice);
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
            (lhs, rhs) => lhs.tree.addAll(rhs.tree),
            (lhs, rhs) => {
                // As buildSliceForUnion use the fact that a RDF.JS dataset
                // have to implement Iterable<Quad>, a Sequence<Quad> can
                // also be passed to buildSliceForUnion.
                let rhsSlice = lhs.indexer.buildSliceForUnion(rhs);
                lhs.tree.insert_all_from_slice(rhsSlice);
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
        if (this.tree === undefined && this.slice === undefined) return 0;

        this._ensure_has_tree();

        let matchResult = this.indexer._matchIndexes(subject, predicate, object, graph);
        if (matchResult == null) {
            return 0;
        } else {
            return this.tree.match_count(matchResult[0], matchResult[1], matchResult[2], matchResult[3]);
        }
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
 * A Stream of Quads with the elements contained in the passed slice
 */
class WasmTreeStoreMatch extends Readable {
    constructor(indexer, slice) {
        super({ "objectMode": true });
        this.slice = slice;
        this.indexer = indexer;
        this.index = 0;
    }

    _read() {
        if (this.index >= this.slice.length) {
            this.push(null);
        } else {
            let spogIndexes = [
                this.slice[this.index],
                this.slice[this.index + 1],
                this.slice[this.index + 2],
                this.slice[this.index + 3]
            ];

            this.index += 4;

            this.push(this.indexer.getQuad(spogIndexes));
        }
    }
}

/**
 * A RDF.JS compliant store (http://rdf.js.org/stream-spec/) that resorts to a
 * backend which is a tree structure in Web Assembly and a frontend which is a
 * Javascript map with a correspondance between RDF.JS terms and indexes
 * (numbers). 
 */
class TreeStore {
    /**
     * Builds an empty store
     */
    constructor() {
        this.tree = new rust.TreedDataset();
        this.indexer = new Indexer();

        if (registry) {
            registry.register(this, this.tree);
        }
    }

    /**
     * Ensures a backend tree is created
     */
    _ensure_has_tree() {
        if (this.tree === null) {
            this.tree = new rust.TreedDataset();

            if (registry) {
                registry.register(this, this.tree);
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
        if (this.tree === null) return new WasmTreeStoreMatch(this.indexer, []);

        let matchResult = this.indexer._matchIndexes(subject, predicate, object, graph);
        if (matchResult == null) {
            return new WasmTreeStoreMatch(this.indexer, []);
        } else {
            let slice = this.tree.get_all(matchResult[0], matchResult[1], matchResult[2], matchResult[3]);
            return new WasmTreeStoreMatch(this.indexer, slice)
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
        if (this.tree === null) return 0;

        let matchResult = this.indexer._matchIndexes(subject, predicate, object, graph);
        if (matchResult == null) {
            return 0;
        } else {
            return this.tree.match_count(matchResult[0], matchResult[1], matchResult[2], matchResult[3]);
        }
    }

    /**
     * Adds in this store every quad from the given stream of quads.
     * @param {*} streamOfQuads The stream of quads
     */
    import(streamOfQuads) {
        this._ensure_has_tree();
        let that = this;

        streamOfQuads.on('data', quad => {
            let quadIndexes = that.indexer.findOrAddIndexes(quad);
            that.tree.add(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        });

        return streamOfQuads;
    }

    /**
     * Removes from this store every quad in the given stream of quads
     * @param {*} streamOfQuads The stream of quads to remove
     */
    remove(streamOfQuads) {
        // TODO : a valid strategy would be to batch remove the quads from the
        // rust dataset using a buffer and the end event to remove the last
        // buffered quads
        let that = this;

        streamOfQuads.on('data', quad => {
            if (that.tree === null) return;

            let quadIndexes = that.indexer.findIndexes(quad);

            if (quadIndexes !== null) {
                that.tree.remove(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
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

        let matchResult = this.indexer._matchIndexes(subject, predicate, object, graph);
        if (matchResult == null) {
            eventEmitter.emit('end');
        } else {
            let that = this;
            
            asyncCall(() => {
                if (that.tree !== null) {
                    that.tree.deleteMatches(matchResult[0], matchResult[1], matchResult[2], matchResult[3]);
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
     * Synchronously liberates the memory assigned to this tree by the Web
     * Assembly linear memory and empty the store.
     */
    free() {
        if (this.tree !== null) {
            this.tree.free();
            this.tree = null;


            if (registry) {
                registry.unregister(this);
            }
        }
    }

    /**
     * Synchronously add the given quad to the store
     * @param {*} quad The RDF.JS quad to add
     */
    addQuad(quad) {
        let quadIndexes = this.indexer.findOrAddIndexes(quad);
        this.tree.add(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        return this;
    }

    /**
     * Synchronously add the given quad to the store
     * @param {*} quad The RDF.JS quad to add
     */
    add(quad) {
        return this.addQuad(quad);
    }
}

/**
 * Builds a new wasm tree store containing every quad from the stream
 * @param {RDF.Stream} stream The stream containing the quads.
 */
function storeStream(stream) {
    const store = new TreeStore();
    return new Promise(resolve => store.import(stream).on("end", () => resolve(store)));
}

// Exports

module.exports = {};

module.exports.TreeDataset = TreeDataset;
module.exports.TreeStore = TreeStore;

module.exports.Dataset = TreeDataset;
module.exports.Store = TreeStore;

module.exports.storeStream = storeStream;
