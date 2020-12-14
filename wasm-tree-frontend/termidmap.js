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
 * 
 * Identifier Quad refers to a quad in the form of four identifiers.
 * RDF.JS Quad and Term Quad refers to a quad which contains terms: for example
 * that is object is rdf:type.
 */
class TermIdMap {
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
    static duplicate(source, identifierList) {
        let self = new TermIdMap();
        let identifiers = new Set(identifierList);

        for (const identifier of identifiers) {
            let term = source.identifiersToTerms[identifier];
            self.termsToIdentifiers[term] = identifier;
            self.identifiersToTerms[identifier] = term;
        }

        self.nextIdentifier = source.nextIdentifier;

        return self;
    }

    /**
     * Returns the graphy term bound to this identifier
     * @param {number} identifier The identifier
     */
    getTerm(identifier) {
        return this.identifiersToTerms[identifier];
    }

    /**
     * Returns the identifier of the given term, or undefined if not mapped
     * @param {Object} term The identifier
     */
    findIdentifier(term) {
        let graphyTerm = graphyFactory.fromTerm(term);
        let concise = graphyTerm.concise();
        return this.termsToIdentifiers[concise];
    }

    /**
     * Returns the identifier of the given term. If not present, a new
     * identifier will be attributed to it and it will be returned.
     * @param {Object} term The term
     */
    findOrBuildIdentifier(term) {
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
     * @param {Object} termQuad A RDF.JS compliant quad
     */
    convertToIdentifierQuad(termQuad) {
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
     * @param {Object} termQuad A RDF.JS compliant quad
     */
    tryConvertToIdentifierQuad(termQuad) {
        let identifierQuad = [
            this.findIdentifier(termQuad.subject),
            this.findIdentifier(termQuad.predicate),
            this.findIdentifier(termQuad.object),
            this.findIdentifier(termQuad.graph)
        ];

        for (let i = 0 ; i != 4 ; i++) {
            if (identifierQuad[i] === undefined) {
                return null;
            }
        }

        return identifierQuad;
    }

    /**
     * Returns a RDF.JS quad if all the passed identifiers exist in this
     * term-id map, null if one of them does not exist, returns null
     * @param {*} spog An array of four identifiers. Its content is altered by
     * this function.
     */
    getQuad(identifierQuad) {
        for (let i = 0 ; i != 4 ; ++i) {
            identifierQuad[i] = this.getTerm(identifierQuad[i]);
            if (identifierQuad[i] === undefined) return null;
        }

        return graphyFactory.quad(
            identifierQuad[0],
            identifierQuad[1],
            identifierQuad[2],
            identifierQuad[3]
        );
    }

    /**
     * Write in the array at position [startingPosition:startingPosition+4] the
     * identifiers of the subject, the predicate, the object and the graph of
     * the given quad.
     * 
     * This function is designe to be able to store identifiers without creating
     * a temporary array like the convertToIdentifierQuad method
     * @param {*} array An array (or an array like structure) in which the
     * identifiers will be written
     * @param {Number} startingPosition Position where the subject identifier
     * will be written
     * @param {*} quad The RDF.JS compliant quad
     */
    convertToIdentifierQuadInArray(array, startingPosition, quad) {
        array[startingPosition + 0] = this.findOrBuildIdentifier(quad.subject)
        array[startingPosition + 1] = this.findOrBuildIdentifier(quad.predicate)
        array[startingPosition + 2] = this.findOrBuildIdentifier(quad.object)
        array[startingPosition + 3] = this.findOrBuildIdentifier(quad.graph)
    }

    /**
     * Find or build an identifier for the given term quad and push them in
     * the given array
     * @param {*} array The array to fill
     * @param {*} quad The RDF.JS quad to insert in the list of term
     * identifiers
     */
    _convertToIdentifierQuadPushedInArray(array, quad) {
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
     * @param {*} dataset The other dataset
     */
    buildIdentifierListForIntersection(dataset) {
        let array = [];

        for (let quad of dataset) {
            let quadIdentifier = this.tryConvertToIdentifierQuad(quad);
            if (quadIdentifier != null) {
                array.push(...quadIdentifier);
            }
        }

        return array;
    }

    /**
     * Build an array that is suitable to pass to a wasm tree that uses
     * the identifiers described by this term-id map for the union function
     * (or any function that results in a dataset that will contains quads
     * from the current and/or the other dataset)
     * @param {*} dataset The other dataset
     */
    buildIdentifierListForUnion(dataset) {
        const length = dataset.length;
        if (isLikeNone(length)) {
            // We do not know in advance the length of the dataset. Only use the iterator
            let array = [];

            for (let quad of dataset) {
                this._convertToIdentifierQuadPushedInArray(array, quad);
            }

            return array;
        } else {
            let array = new Array(dataset.length * 4);

            let i = 0;
            for (let quad of dataset) {
                this.convertToIdentifierQuadInArray(array, i, quad);
                i += 4;
            }

            return array;
        }
    }

    /**
     * Build an identifier list from a list of RDF.JS quads. If a term has no
     * known identifier, null is returned instead.
     * @param {*} dataset A list of RDF.JS quads
     */
    buildIdentifierListForEquality(dataset) {
        let array = [];

        for (let quad of dataset) {
            let identifiers = this.tryConvertToIdentifierQuad(quad);
            if (identifiers != null) {
                array.push(...identifiers);
            } else {
                return null;
            }
        }

        return array;
    }

    /**
     * Transforms the subject, predicate, object and graph received as Terms
     * into identifiers. If a matching could not be done, returns null. Else,
     * returns an array with the identifiers or null/undefined when the term
     * was already null or undefined.
     * 
     * @param {?Term} subject 
     * @param {?Term} predicate 
     * @param {?Term} object 
     * @param {?Term} graph 
     */
    matchIdentifiers(subject, predicate, object, graph) {
        if (!isLikeNone(subject)) {
            subject = this.findIdentifier(subject);
            if (isLikeNone(subject)) return null;
        }

        if (!isLikeNone(predicate)) {
            predicate = this.findIdentifier(predicate);
            if (isLikeNone(predicate)) return null;
        }

        if (!isLikeNone(object)) {
            object = this.findIdentifier(object);
            if (isLikeNone(object)) return null;
        }

        if (!isLikeNone(graph)) {
            graph = this.findIdentifier(graph);
            if (isLikeNone(graph)) return null;
        }

        return [subject, predicate, object, graph]
    }
}

/** An iterator on a WasmTreeDataset */
class WasmTreeDatasetIterator {
    constructor(wasmTreeDataset) {
        this.index = 0;
        this.data = wasmTreeDataset._asIdentifierList();
        this.termIdMap = wasmTreeDataset.termIdMap;
        this.wasmTreeDataset = wasmTreeDataset;
    }

    next() {
        if (this.index >= this.data.length) {
            return { value: null, done: true };
        } else {
            let identifierQuad = [
                this.data[this.index],
                this.data[this.index + 1],
                this.data[this.index + 2],
                this.data[this.index + 3]
            ];
            
            let value = this.termIdMap.getQuad(identifierQuad);
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
    mapInUInt32Array(quadMapIteratee) {
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

module.exports = {};
module.exports.TermIdMap = TermIdMap;
module.exports.WasmTreeDatasetIterator = WasmTreeDatasetIterator;
