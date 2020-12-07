const wasmTreeBackend = require('@bruju/wasm-tree-backend');
const { Indexer, WasmTreeDatasetIterator } = require('./indexer.js')

// This module contains implementations that uses either the indexList cache
// strategy or the shared indexer strategy.
//
// In most application, you should use Dataset instead, or in some rare cases
// AlwaysForestDataset
//
// Also note that even if you have the FinalizationRegistry, these structures
// won't be freed automatically

class DatasetWithIndexListNoSharedIndexer {
    constructor(indexer, indexList, forest) {
        if (indexer === undefined) {
            this.indexer = new Indexer();
            this.forest = new wasmTreeBackend.TreedDataset();
            this.indexList = undefined;
        } else {
            this.indexer = Indexer.duplicate(indexer, indexList);
            this.forest = forest == null ? undefined : forest;
            this.indexList = indexList == null ? undefined : indexList;
        }
    }

    _ensureHasForest() {
        if (this.forest === undefined) {
            if (this.indexList !== undefined) {
                this.forest = wasmTreeBackend.TreedDataset.new_from_slice(this.indexList);
            } else {
                this.forest = new wasmTreeBackend.TreedDataset();
            }
        }
    }

    _ensureHasModifiableForest() {
        this._ensureHasForest();
        this.indexList = undefined;
    }

    free() {
        if (this.forest !== undefined) {
            this.forest.free();
            this.forest = undefined;
        }

        this.indexList = undefined;
    }

    get size() {
        if (this.indexList !== undefined) {
            return this.indexList.length / 4;
        } else if (this.forest !== undefined) {
            return this.forest.size();
        } else {
            return 0;
        }
    }

    [Symbol.iterator]() {
        return new WasmTreeDatasetIterator(this);
    }

    add(quad) {
        this._ensureHasModifiableForest();

        let quadIndexes = this.indexer.findOrAddIndexes(quad);
        this.forest.add(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        return this;
    }

    delete(quad) {
        let quadIndexes = this.indexer.findIndexes(quad);

        if (quadIndexes !== null) {
            this._ensureHasModifiableForest();
            this.forest.remove(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        }

        return this;
    }

    has(quad) {
        let quadIndexes = this.indexer.findIndexes(quad);

        if (quadIndexes === null) {
            return false;
        } else {
            // TODO : Instead of building a forest, we could create a new intermediate state
            // where the backend owns an indexList but has not yet built any tree.
            this._ensureHasForest();
            return this.forest.has(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        }
    }

    match(subject, predicate, object, graph) {
        // Rewrite match parameters with indexes
        let matchResult = this.indexer.matchIndexes(subject, predicate, object, graph);
        if (matchResult === null) {
            return new DatasetWithIndexListNoSharedIndexer(this.indexer);
        }

        // Match is valid
        this._ensureHasForest();
        let indexList = this.forest.get_all(
            matchResult[0], matchResult[1], matchResult[2], matchResult[3]
        );
        return new DatasetWithIndexListNoSharedIndexer(this.indexer, indexList);
    }

    _getIndexList() {
        if (this.indexList === undefined) {
            if (this.forest === undefined) {
                return [];
            }

            this.indexList = this.forest.get_all(null, null, null, null);
        }

        return this.indexList;
    }

    toArray() {
        return Array.from(this[Symbol.iterator]);
    }

    ensureHasIndexFor(subject, predicate, object, graph) {
        this._ensureHasForest();
        this.forest.ensure_has_index_for(!!subject, !!predicate, !!object, !!graph);
    }
}

class DatasetWithSharedIndexerNoIndexList {
    constructor(indexer, indexList) {
        if (indexList != undefined) {
            this.forest = wasmTreeBackend.TreedDataset.new_from_slice(indexList);
            this.indexer = indexer;
        } else {
            this.forest = new wasmTreeBackend.TreedDataset();
            this.indexer = new Indexer();
        }
    }

    _ensureHasForest() {
        if (this.forest === undefined) {
            this.forest = new wasmTreeBackend.TreedDataset();
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

    add(quad) {
        this._ensureHasForest();

        let quadIndexes = this.indexer.findOrAddIndexes(quad);
        this.forest.add(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        return this;
    }

    delete(quad) {
        let quadIndexes = this.indexer.findIndexes(quad);

        if (quadIndexes !== null) {
            this._ensureHasForest();
            this.forest.remove(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        }

        return this;
    }

    has(quad) {
        let quadIndexes = this.indexer.findIndexes(quad);

        if (quadIndexes === null) {
            return false;
        } else {
            this._ensureHasForest();
            return this.forest.has(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        }
    }

    match(subject, predicate, object, graph) {
        // Rewrite match parameters with indexes
        let matchResult = this.indexer.matchIndexes(subject, predicate, object, graph);
        if (matchResult === null) {
            return new DatasetWithSharedIndexerNoIndexList(this.indexer);
        }

        // Match is valid
        this._ensureHasForest();
        let indexList = this.forest.get_all(
            matchResult[0], matchResult[1], matchResult[2], matchResult[3]
        );
        return new DatasetWithSharedIndexerNoIndexList(this.indexer, indexList);
    }

    _getIndexList() {
        if (this.forest === undefined) {
            return [];
        } else {
            return this.forest.get_all(null, null, null, null);
        }
    }

    toArray() {
        return Array.from(this[Symbol.iterator]);
    }

    ensureHasIndexFor(subject, predicate, object, graph) {
        this._ensureHasForest();
        this.forest.ensure_has_index_for(!!subject, !!predicate, !!object, !!graph);
    }
}



module.exports = {};
module.exports.DatasetWithIndexListNoSharedIndexer = DatasetWithIndexListNoSharedIndexer;
module.exports.DatasetWithSharedIndexerNoIndexList = DatasetWithSharedIndexerNoIndexList;
