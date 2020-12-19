const wasmTreeBackend = require('@bruju/wasm-tree-backend');
const { TermIdMap, WasmTreeDatasetIterator } = require('./termidmap.js')

// This module contains implementations that uses either the identifierList
// cache strategy or the shared term-id map strategy.
//
// In most application, you should use Dataset instead, or in some rare cases
// AlwaysForestDataset
//
// Also note that even if you have the FinalizationRegistry, these structures
// won't be freed automatically

class DatasetWithIdentifierList {
    constructor(termIdMap, identifierList, forest) {
        if (termIdMap === undefined) {
            this.termIdMap = new TermIdMap();
            this.forest = new wasmTreeBackend.ForestOfIdentifierQuads();
            this.identifierList = undefined;
        } else {
            this.termIdMap = TermIdMap.duplicate(termIdMap, identifierList);
            this.forest = forest == null ? undefined : forest;
            this.identifierList = identifierList == null ? undefined : identifierList;
        }
    }

    _ensureHasForest() {
        if (this.forest === undefined) {
            if (this.identifierList !== undefined) {
                this.forest = wasmTreeBackend.ForestOfIdentifierQuads.fromIdentifierList(this.identifierList);
            } else {
                this.forest = new wasmTreeBackend.ForestOfIdentifierQuads();
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

    add(quad) {
        this._ensureHasModifiableForest();

        let identifierQuad = this.termIdMap.convertToIdentifierQuad(quad);
        this.forest.add(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        return this;
    }

    delete(quad) {
        let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

        if (identifierQuad !== null) {
            this._ensureHasModifiableForest();
            this.forest.remove(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        }

        return this;
    }

    has(quad) {
        let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

        if (identifierQuad === null) {
            return false;
        } else {
            this._ensureHasForest();
            return this.forest.has(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        }
    }

    match(subject, predicate, object, graph) {
        // Rewrite match parameters with identifiers
        let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
        if (matchResult === null) {
            return new DatasetWithIdentifierList(this.termIdMap);
        }

        // Match is valid
        this._ensureHasForest();
        let identifierList = this.forest.get_all(
            matchResult[0], matchResult[1], matchResult[2], matchResult[3]
        );
        return new DatasetWithIdentifierList(this.termIdMap, identifierList);
    }

    _asIdentifierList() {
        if (this.identifierList === undefined) {
            if (this.forest === undefined) {
                return [];
            }

            this.identifierList = this.forest.get_all(null, null, null, null);
        }

        return this.identifierList;
    }

    toArray() {
        return Array.from(this[Symbol.iterator]);
    }

    ensureHasIndexFor(subject, predicate, object, graph) {
        this._ensureHasForest();
        this.forest.ensureHasIndexfor(!!subject, !!predicate, !!object, !!graph);
    }
}

class DatasetWithSharedTermIdMap {
    constructor(termIdMap, identifierList) {
        if (identifierList != undefined) {
            this.forest = wasmTreeBackend.ForestOfIdentifierQuads.fromIdentifierList(identifierList);
            this.termIdMap = termIdMap;
        } else {
            this.forest = new wasmTreeBackend.ForestOfIdentifierQuads();
            this.termIdMap = new TermIdMap();
        }
    }

    _ensureHasForest() {
        if (this.forest === undefined) {
            this.forest = new wasmTreeBackend.ForestOfIdentifierQuads();
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

        let identifierQuad = this.termIdMap.convertToIdentifierQuad(quad);
        this.forest.add(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        return this;
    }

    delete(quad) {
        let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

        if (identifierQuad !== null) {
            this._ensureHasForest();
            this.forest.remove(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        }

        return this;
    }

    has(quad) {
        let identifierQuad = this.termIdMap.tryConvertToIdentifierQuad(quad);

        if (identifierQuad === null) {
            return false;
        } else {
            this._ensureHasForest();
            return this.forest.has(identifierQuad[0], identifierQuad[1], identifierQuad[2], identifierQuad[3]);
        }
    }

    match(subject, predicate, object, graph) {
        // Rewrite match parameters with identifiers
        let matchResult = this.termIdMap.matchIdentifiers(subject, predicate, object, graph);
        if (matchResult === null) {
            return new DatasetWithSharedTermIdMap(this.termIdMap);
        }

        // Match is valid
        this._ensureHasForest();
        let identifierList = this.forest.get_all(
            matchResult[0], matchResult[1], matchResult[2], matchResult[3]
        );
        return new DatasetWithSharedTermIdMap(this.termIdMap, identifierList);
    }

    _asIdentifierList() {
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
        this.forest.ensureHasIndexfor(!!subject, !!predicate, !!object, !!graph);
    }
}


module.exports = {};
module.exports.DatasetWithIdentifierList = DatasetWithIdentifierList;
module.exports.DatasetWithSharedTermIdMap = DatasetWithSharedTermIdMap;
