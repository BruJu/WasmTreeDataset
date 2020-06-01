let graphyFactory = require('@graphy/core.data.factory');
let rust = require('./rusttree.js')

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
     * @param {Object} quad A RDF.JS complient quad
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
     * @param {Object} quad A RDF.JS complient quad
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
}

/** An iterator on a Wrapped Tree */
class WrappedTreeIterator {
    constructor(wrappedTree) {
        this.index = 0;
        this.data = wrappedTree.tree.get_all(null, null, null, null);
        this.indexer = wrappedTree.indexer;
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

    /*
    let index = 0;
    let data = this.tree.get_all(null, null, null, null);
    var indexer = this.indexer;
    let buildQuad = function(data, indexer) {
        let spog = [data[index], data[index + 1], data[index + 2], data[index + 3]]
        index = index + 4;
        for (let i = 0 ; i != 4 ; ++i) {
            if (spog[i] === undefined) return undefined;
            let actualTerm = indexer.getTerm(spog[i]);
            if (actualTerm === undefined) return undefined;
            spog[i] = actualTerm;
        }

        return graphyFactory.quad(spog[0], spog[1], spog[2], spog[3]);
    }

    return {
        next: function() {
            return { value: buildQuad(data, indexer), done: index > data.length }
        }
    };
    */

}

/**
 * A RDF.JS DatasetCore that resorts on a wasm exported structure that
 * uses several TreeSet and an Indexer.
 */
class WrappedTree {
    /**
     * Constructs a Wrapped Tree
     * @param {*} baseTree If provided, the wasm trees
     * @param {*} indexer If provided, the indexer to uses
     */
    constructor(baseTree, indexer) {
        if (baseTree === undefined) {
            this.tree = new rust.TreedDataset();
        } else {
            this.tree = baseTree;
        }
        
        this.indexer = indexer === undefined ? new Indexer() : indexer;
        // TODO : pattern matching
    }

    /**
     * Liberates the memory allocated by wasm for the tree
     */
    free() {
        this.tree.free();
    }

    /**
     * Returns the number of contained elements.
     */
    get size() {
        // TODO : use pattern match in size
        return this.tree.size();
    }

    [Symbol.iterator]() {
        return new WrappedTreeIterator(this);
    }

    /**
     * Adds the quad to the dataset
     * @param {*} quad 
     */
    add(quad) {
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
        if (!isLikeNone(subject)) {
            subject = this.indexer.findIndex(subject);
            if (isLikeNone(subject)) return new WrappedTree();
        }

        if (!isLikeNone(predicate)) {
            predicate = this.indexer.findIndex(predicate);
            if (isLikeNone(predicate)) return new WrappedTree();
        }

        if (!isLikeNone(object)) {
            object = this.indexer.findIndex(object);
            if (isLikeNone(object)) return new WrappedTree();
        }

        if (!isLikeNone(graph)) {
            graph = this.indexer.findIndex(graph);
            if (isLikeNone(graph)) return new WrappedTree();
        }

        // Match is valid
        let builtTree = this.tree.new_from(subject, predicate, object, graph);
        return new WrappedTree(builtTree, this.indexer);
    }
}

module.exports = WrappedTree;
