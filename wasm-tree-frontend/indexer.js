const graphyFactory = require('@graphy/core.data.factory');

/**
 * Returns true if expr is undefined or null
 * @param {*} expr 
 */
function isLikeNone(expr) {
    return expr === undefined || expr === null;
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
     * Clone the indexer with only index from the indexList
     * @param {*} indexer 
     * @param {*} indexList 
     */
    static duplicate(indexer, indexList) {
        let self = new Indexer();
        let indexes = new Set(indexList);

        for (const index of indexes) {
            let term = indexer.indexToTerms[index];
            self.termsToIndex[term] = index;
            self.indexToTerms[index] = term;
        }

        self.nextValue = indexer.nextValue;

        return self;
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
    matchIndexes(subject, predicate, object, graph) {
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

/** An iterator on a WasmTreeDataset */
class WasmTreeDatasetIterator {
    constructor(wasmTreeDataset) {
        this.index = 0;
        this.data = wasmTreeDataset._getIndexList();
        this.indexer = wasmTreeDataset.indexer;
        this.wasmTreeDataset = wasmTreeDataset;
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

    /**
     * Builds a new Uint32Array which contains the index quads read from
     * this iterator which returns true for the `quadFilterIteratee` predicate
     * when converted to a term quad.
     * 
     * Consumes the whole iterator.
     * @param {*} quadFilterIteratee 
     */
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

            if (quadFilterIteratee(it.value, this.wasmTreeDataset)) {
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

            let mappedQuad = quadMapIteratee(it.value, this.wasmTreeDataset);
            this.indexer.writeTermIndexesIn(resultingArray, i, mappedQuad);
            i += 4;
        }

        return resultingArray;
    }
}

module.exports = {};
module.exports.Indexer = Indexer;
module.exports.WasmTreeDatasetIterator = WasmTreeDatasetIterator;
