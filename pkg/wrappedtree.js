let graphyFactory = require('@graphy/core.data.factory');
let rust = require('./rusttree.js')


function isLikeNone(expr) {
    return expr === undefined || expr === null;
}


class Indexer {
    constructor() {
        this.indexToTerms = [graphyFactory.defaultGraph()];
        this.termsToIndex = {};
        this.termsToIndex[graphyFactory.defaultGraph().concise()] = 0;
        this.nextValue = 1;
    }

    getTerm(index) {
        return this.indexToTerms[index];
    }

    findIndex(term) {
        let graphyTerm = graphyFactory.fromTerm(term);
        let concise = graphyTerm.concise();
        return this.termsToIndex[concise];
    }

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

    findOrAddIndexes(quad) {
        return [
            this.findOrAddIndex(quad.subject),
            this.findOrAddIndex(quad.predicate),
            this.findOrAddIndex(quad.object),
            this.findOrAddIndex(quad.graph)
        ];
    }

    findIndexes(quad) {
        let quadIndexes = [
            this.findOrAddIndex(quad.subject),
            this.findOrAddIndex(quad.predicate),
            this.findOrAddIndex(quad.object),
            this.findOrAddIndex(quad.graph)
        ];

        for (let i = 0 ; i != 4 ; i++) {
            if (quadIndexes[i] === undefined) {
                return null;
            }
        }

        return quadIndexes;
    }
}


class WrappedTree {
    constructor(baseTree, indexer) {
        if (baseTree === undefined) {
            this.tree = new rust.TreedDataset();
        } else {
            this.tree = baseTree;
        }
        
        this.indexer = indexer === undefined ? new Indexer() : indexer;
        // TODO : pattern matching
    }

    get size() {
        // TODO : use pattern match in size
        return this.tree.size();
    }

    [Symbol.iterator]() {
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
    }

    add(quad) {
        let quadIndexes = this.indexer.findOrAddIndexes(quad);
        this.tree.add(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        return this;
    }

    delete(quad) {
        let quadIndexes = this.indexer.findIndexes(quad);

        if (quadIndexes !== null) {
            this.tree.remove(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        }

        return this;
    }

    has(quad) {
        let quadIndexes = this.indexer.findIndexes(quad);

        if (quadIndexes === null) {
            return false;
        } else {
            return this.tree.has(quadIndexes[0], quadIndexes[1], quadIndexes[2], quadIndexes[3]);
        }
    }

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
